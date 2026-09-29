import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import type { UserRole } from '../auth';
import { isPasswordAuthEnabled, isProxyAuthEnabled } from './mode';

/** First-sign-in bootstrap: if the table has no admin yet, promote this user.
 *
 * Idempotent — once any admin exists, the WHERE NOT EXISTS clause makes it
 * a no-op. Returns the resulting role for the given user. Call this only on
 * insert paths or right after a successful first sign-in; do not run it on
 * every read or you'll hammer the table for no reason.
 *
 * Migration `0011` runs an equivalent UPDATE for existing instances; this
 * helper covers the fresh-install case where the migration's UPDATE no-oped
 * because the table was empty at migrate time.
 */
export async function ensureAdminBootstrap(userId: string): Promise<UserRole> {
  const [row] = await db
    .update(users)
    .set({ role: 'admin' })
    .where(
      and(
        eq(users.id, userId),
        sql`NOT EXISTS (SELECT 1 FROM ${users} WHERE ${users.role} = 'admin' AND ${users.id} <> ${userId})`,
      ),
    )
    .returning({ role: users.role });
  return (row?.role as UserRole) ?? 'user';
}

/**
 * Zero-config first run.
 *
 * A fresh `docker compose up` with no `.env` has no users, no way to run
 * `npm run user:create` without a shell, and (as of this change) no
 * operator-supplied `AUTH_SECRET` either — the entrypoint generates one.
 * Setup mode is how the very first admin gets created anyway:
 *
 * - `/login` redirects to `/signup` while the instance has zero users,
 *   password auth is on, and proxy auth is off (proxy auth has its own
 *   provisioning story and must never be short-circuited by this).
 * - `/signup` in that state asks for a "setup code" in addition to the
 *   usual email/password. The code is deterministic — an HMAC of
 *   `AUTH_SECRET` — so it never needs to be stored anywhere; it's printed
 *   to the container logs once at boot (see `instrumentation.ts`) and the
 *   operator copies it from `docker compose logs app`.
 * - The account created this way is pre-confirmed and created as `admin`
 *   directly (no need for the generic "first sign-in promotes" path in
 *   `ensureAdminBootstrap` above), under a Postgres advisory lock so two
 *   browser tabs racing the setup form can't both end up inserting an
 *   admin row.
 */

const SETUP_CODE_HMAC_LABEL = 'strawberry-notes:setup-code:v1';
// Human-typeable alphabet: uppercase + digits, minus 0/O/1/I so a
// misread character never produces a *different valid-looking* code.
const SETUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SETUP_CODE_CHARS = 8;

/** Arbitrary but fixed advisory-lock key, namespaced to this feature so it
 * can never collide with an advisory lock some other part of the app (or a
 * future migration) takes out. Picked by hand, has no other meaning. */
const FIRST_ADMIN_LOCK_KEY = 721_198_004;

function normalizeSetupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Deterministic 8-character code derived from AUTH_SECRET. Same secret
 * always yields the same code, so nothing needs to be persisted — the
 * operator re-derives it by re-reading the boot log. */
export function computeSetupCode(authSecret: string): string {
  if (!authSecret) {
    throw new Error('AUTH_SECRET is required to compute the setup code');
  }
  const digest = createHmac('sha256', authSecret).update(SETUP_CODE_HMAC_LABEL).digest();
  let code = '';
  for (let i = 0; i < SETUP_CODE_CHARS; i++) {
    code += SETUP_CODE_ALPHABET[digest[i] % SETUP_CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Constant-time compare against the code derived from AUTH_SECRET, so a
 * timing side-channel can't help an attacker guess it character-by-character. */
export function verifySetupCode(candidate: string, authSecret: string): boolean {
  if (!candidate || !authSecret) return false;
  let expected: string;
  try {
    expected = normalizeSetupCode(computeSetupCode(authSecret));
  } catch {
    return false;
  }
  const a = Buffer.from(normalizeSetupCode(candidate), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function anyUserExists(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return !!row;
}

/**
 * True when the instance should show the setup-code signup flow instead of
 * a normal login form: password auth is the active mode, proxy auth (which
 * bypasses first-party login entirely) is off, and no user row exists yet.
 */
export async function isSetupModeActive(): Promise<boolean> {
  if (!isPasswordAuthEnabled() || isProxyAuthEnabled()) return false;
  return !(await anyUserExists());
}

export type CreateFirstAdminResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'users_exist' };

/**
 * Create the first user as a confirmed admin. Wrapped in a Postgres
 * advisory transaction lock (`pg_advisory_xact_lock`, auto-released at
 * commit/rollback) keyed on `FIRST_ADMIN_LOCK_KEY` so two requests racing
 * the setup form — e.g. a double-click, or two tabs — serialize instead of
 * both passing the "no users yet" check and both inserting an admin.
 * The loser sees `users_exist` and should be told to use /login instead.
 */
export async function createFirstAdminUser(params: {
  email: string;
  passwordHash: string;
}): Promise<CreateFirstAdminResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${FIRST_ADMIN_LOCK_KEY})`);
    const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing) {
      return { ok: false, reason: 'users_exist' } as const;
    }
    const [row] = await tx
      .insert(users)
      .values({
        email: params.email,
        passwordHash: params.passwordHash,
        emailConfirmedAt: new Date(),
        role: 'admin',
      })
      .returning({ id: users.id });
    return { ok: true, userId: row.id } as const;
  });
}

export const __TEST = { normalizeSetupCode, anyUserExists };
