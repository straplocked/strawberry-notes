/**
 * Email-confirmation tokens for the optional signup-confirmation flow,
 * gated by the `REQUIRE_EMAIL_CONFIRMATION` env var.
 *
 * Mirrors `lib/auth/password-reset.ts` in shape but a separate table —
 * the lifecycles don't tangle and the per-user "do I have a pending
 * confirmation?" lookup stays simple.
 *
 * Tokens are 32 random bytes hex-encoded with an `ecf_` prefix, hashed
 * SHA-256 at rest, single-use, default 24-hour TTL (longer than reset
 * because confirmation emails sit unread for longer in practice).
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db/client';
import { emailConfirmations, users } from '../db/schema';

const TOKEN_PREFIX = 'ecf_';
const TOKEN_BYTES = 32;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface IssueOptions {
  ttlMs?: number;
  now?: Date;
}

export interface IssuedConfirmationToken {
  userId: string;
  token: string;
  expiresAt: Date;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateRawToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('hex')}`;
}

/** True when the row says this user has confirmed their email at least once. */
export async function isUserEmailConfirmed(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ confirmedAt: users.emailConfirmedAt })
    .from(users)
    .where(eq(users.id, userId));
  return !!u?.confirmedAt;
}

export async function isEmailConfirmedByEmail(email: string): Promise<boolean> {
  const [u] = await db
    .select({ confirmedAt: users.emailConfirmedAt })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  return !!u?.confirmedAt;
}

/**
 * Mint a fresh confirmation token for the user. Reaps stale rows
 * (expired or used) for that user opportunistically. Only pre-existing
 * users can be issued tokens; the typical caller is the signup route
 * immediately after insert.
 */
export async function issueEmailConfirmationToken(
  userId: string,
  opts: IssueOptions = {},
): Promise<IssuedConfirmationToken> {
  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (opts.ttlMs ?? DEFAULT_TTL_MS));

  await db
    .delete(emailConfirmations)
    .where(
      and(
        eq(emailConfirmations.userId, userId),
        or(lt(emailConfirmations.expiresAt, now), isNotNull(emailConfirmations.usedAt))!,
      ),
    )
    .catch(() => {});

  const token = generateRawToken();
  await db.insert(emailConfirmations).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { userId, token, expiresAt };
}

/** Same flow but keyed by email — used by `resend-confirmation` and signup. */
export async function issueEmailConfirmationTokenForEmail(
  rawEmail: string,
  opts: IssueOptions = {},
): Promise<IssuedConfirmationToken | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return null;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!u) return null;
  return issueEmailConfirmationToken(u.id, opts);
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Verify the token and flip `users.email_confirmed_at` to now() in a
 * single transaction. Single-use; concurrent reuse loses the race.
 */
export async function consumeEmailConfirmationToken(
  rawToken: string,
  opts: { now?: Date } = {},
): Promise<ConsumeResult> {
  if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) {
    return { ok: false, reason: 'invalid' };
  }
  const now = opts.now ?? new Date();
  const tokenHash = hashToken(rawToken);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(emailConfirmations)
      .where(eq(emailConfirmations.tokenHash, tokenHash));
    if (!row) return { ok: false, reason: 'invalid' as const };
    if (row.usedAt) return { ok: false, reason: 'used' as const };
    if (row.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: 'expired' as const };
    }
    const claimed = await tx
      .update(emailConfirmations)
      .set({ usedAt: now })
      .where(and(eq(emailConfirmations.id, row.id), isNull(emailConfirmations.usedAt)))
      .returning({ id: emailConfirmations.id });
    if (claimed.length === 0) {
      return { ok: false, reason: 'used' as const };
    }
    await tx.update(users).set({ emailConfirmedAt: now }).where(eq(users.id, row.userId));
    return { ok: true, userId: row.userId };
  });
}

export const __TEST = { TOKEN_PREFIX, DEFAULT_TTL_MS, hashToken };
