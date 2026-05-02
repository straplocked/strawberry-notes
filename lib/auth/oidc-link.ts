/**
 * Resolves an OIDC sign-in attempt to a local user row.
 *
 * Decision matrix (in order):
 *   1. `oidc_accounts(provider='oidc', subject)` already exists → attach.
 *   2. No link, but a user exists with the IdP's email AND `email_verified`:
 *      - If `OIDC_TRUST_EMAIL_FOR_LINKING=true` → create the link row, attach.
 *      - Else REFUSE. The user must sign in with password first and link
 *        from /settings — silent email-based linking is an account takeover
 *        vector when the IdP admin can set arbitrary emails.
 *   3. No link, no matching user:
 *      - If `OIDC_AUTO_PROVISION=true` AND `email_verified` → JIT-create the
 *        user (passwordHash=null, emailConfirmedAt=now), insert link row,
 *        run admin-bootstrap, seed first-run content.
 *      - Else REFUSE.
 *   4. `email_verified=false` for *any* email-touching branch → REFUSE.
 *
 * Refusals carry a structured reason so the route handler can log without
 * leaking which path triggered the rejection to the client.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { oidcAccounts, users } from '../db/schema';
import type { UserRole } from '../auth';
import { ensureAdminBootstrap } from './bootstrap';
import { oidcAutoProvision, oidcTrustEmailForLinking } from './mode';
import { seedFirstRunContent } from './first-run';

export interface OidcSigninInput {
  subject: string;
  email: string | null | undefined;
  emailVerified: boolean | null | undefined;
  provider?: string;
}

export type OidcResolveResult =
  | { ok: true; userId: string; role: UserRole; email: string; isNew: boolean }
  | { ok: false; reason: 'email_required' | 'email_not_verified' | 'link_refused' | 'provision_disabled' };

export async function resolveOrLinkOidcUser(input: OidcSigninInput): Promise<OidcResolveResult> {
  const provider = input.provider ?? 'oidc';
  const subject = (input.subject ?? '').trim();
  if (!subject) return { ok: false, reason: 'email_required' };

  // 1. Existing link?
  const [existingLink] = await db
    .select({
      userId: oidcAccounts.userId,
      role: users.role,
      email: users.email,
      disabledAt: users.disabledAt,
    })
    .from(oidcAccounts)
    .innerJoin(users, eq(users.id, oidcAccounts.userId))
    .where(and(eq(oidcAccounts.provider, provider), eq(oidcAccounts.subject, subject)));

  if (existingLink) {
    if (existingLink.disabledAt) return { ok: false, reason: 'link_refused' };
    await db
      .update(oidcAccounts)
      .set({ lastLoginAt: new Date() })
      .where(and(eq(oidcAccounts.provider, provider), eq(oidcAccounts.subject, subject)))
      .catch(() => {});
    return {
      ok: true,
      userId: existingLink.userId,
      role: existingLink.role as UserRole,
      email: existingLink.email,
      isNew: false,
    };
  }

  // From here on we're touching email — refuse if missing or unverified.
  const email = (input.email ?? '').trim().toLowerCase();
  if (!email) return { ok: false, reason: 'email_required' };
  if (input.emailVerified !== true) return { ok: false, reason: 'email_not_verified' };

  // 2. Email matches an existing local user — link only with explicit opt-in.
  const [emailUser] = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.email, email));

  if (emailUser) {
    if (!oidcTrustEmailForLinking()) {
      return { ok: false, reason: 'link_refused' };
    }
    if (emailUser.disabledAt) return { ok: false, reason: 'link_refused' };
    await db.insert(oidcAccounts).values({
      userId: emailUser.id,
      provider,
      subject,
      lastLoginAt: new Date(),
    });
    return {
      ok: true,
      userId: emailUser.id,
      role: emailUser.role as UserRole,
      email: emailUser.email,
      isNew: false,
    };
  }

  // 3. No match — auto-provision if configured.
  if (!oidcAutoProvision()) {
    return { ok: false, reason: 'provision_disabled' };
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash: null,
      emailConfirmedAt: new Date(),
    })
    .returning({ id: users.id, email: users.email });

  await db.insert(oidcAccounts).values({
    userId: created.id,
    provider,
    subject,
    lastLoginAt: new Date(),
  });

  // First-run seeding parallels signup + operator-create. Failures here
  // shouldn't block sign-in — log and move on.
  try {
    await seedFirstRunContent(created.id);
  } catch {}

  const role = await ensureAdminBootstrap(created.id);

  return {
    ok: true,
    userId: created.id,
    role,
    email: created.email,
    isNew: true,
  };
}

/** Settings → Security: link the *current* user to an OIDC subject after
 * they've authenticated to /settings via password. Used by the
 * authenticated-link callback (separate from the sign-in callback). */
export async function linkOidcAccount(opts: {
  userId: string;
  provider?: string;
  subject: string;
}): Promise<{ ok: true } | { ok: false; reason: 'subject_taken' }> {
  const provider = opts.provider ?? 'oidc';
  try {
    await db.insert(oidcAccounts).values({
      userId: opts.userId,
      provider,
      subject: opts.subject,
      lastLoginAt: new Date(),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('duplicate') || message.includes('unique')) {
      return { ok: false, reason: 'subject_taken' };
    }
    throw err;
  }
}

export async function unlinkOidcAccount(opts: {
  userId: string;
  provider?: string;
  subject: string;
}): Promise<boolean> {
  const provider = opts.provider ?? 'oidc';
  const rows = await db
    .delete(oidcAccounts)
    .where(
      and(
        eq(oidcAccounts.userId, opts.userId),
        eq(oidcAccounts.provider, provider),
        eq(oidcAccounts.subject, opts.subject),
      ),
    )
    .returning({ id: oidcAccounts.id });
  return rows.length > 0;
}

export async function listOidcAccountsForUser(
  userId: string,
): Promise<
  Array<{ id: string; provider: string; subject: string; createdAt: string; lastLoginAt: string | null }>
> {
  const rows = await db
    .select({
      id: oidcAccounts.id,
      provider: oidcAccounts.provider,
      subject: oidcAccounts.subject,
      createdAt: oidcAccounts.createdAt,
      lastLoginAt: oidcAccounts.lastLoginAt,
    })
    .from(oidcAccounts)
    .where(eq(oidcAccounts.userId, userId));
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    subject: r.subject,
    createdAt: r.createdAt.toISOString(),
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
  }));
}
