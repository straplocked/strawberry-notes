/**
 * Self-service password reset.
 *
 * Flow:
 *
 *   1. `issuePasswordResetTokenForEmail(email)` — looks up the user by email,
 *      generates a `srt_<64-hex>` token, stores its SHA-256 hash with a
 *      1-hour expiry, and returns the raw token. Idempotent for unknown
 *      emails: returns null without an error so the API surface can avoid
 *      enumerating registered addresses.
 *   2. The caller emails the token to the user via `lib/email/client.ts`.
 *   3. `consumePasswordResetToken(rawToken, newPassword)` validates the
 *      token (exists, not expired, not used), updates the user's password
 *      hash, and marks the token used in a single transaction.
 *
 * Security notes:
 *   - Tokens are 32 bytes (256 bits) of randomness, hex-encoded — well above
 *     practical brute-force.
 *   - Stored hashed; the raw value is never persisted.
 *   - Single-use: `used_at` flips on success and is checked on every
 *     verification.
 *   - Reaping: opportunistically delete this user's expired or used rows
 *     on every fresh issue. Keeps the table small without a cron job.
 */

import { hash as bcryptHash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db/client';
import { passwordResetTokens, users } from '../db/schema';
import { notifyPasswordChanged } from '../email/notifications';

const TOKEN_PREFIX = 'srt_';
const TOKEN_BYTES = 32;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MIN_PW = 8;

export interface IssueOptions {
  /** Override the TTL (tests, future per-user policy). */
  ttlMs?: number;
  now?: Date;
}

export interface IssuedResetToken {
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

/**
 * Look up the user by email and mint a fresh reset token. Returns null
 * if no user matches — caller should still surface a generic success
 * message to the requester to avoid leaking which addresses are registered.
 *
 * Cleans up this user's expired or used tokens before insert.
 */
export async function issuePasswordResetTokenForEmail(
  rawEmail: string,
  opts: IssueOptions = {},
): Promise<IssuedResetToken | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return null;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) return null;

  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (opts.ttlMs ?? DEFAULT_TTL_MS));

  // Reap stale rows for this user. Opportunistic — keeps the table small
  // without a cron. Errors here are non-fatal (we still want to issue).
  await db
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        or(lt(passwordResetTokens.expiresAt, now), isNotNull(passwordResetTokens.usedAt))!,
      ),
    )
    .catch(() => {});

  const token = generateRawToken();
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { userId: user.id, token, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'password_too_short' };

/**
 * Verify the token and replace the user's password hash. Single-use:
 * the row's `usedAt` is set inside the same transaction, so a concurrent
 * second consume of the same token loses the race and gets `used`.
 */
export async function consumePasswordResetToken(
  rawToken: string,
  newPassword: string,
  opts: { now?: Date } = {},
): Promise<ConsumeResult> {
  if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) {
    return { ok: false, reason: 'invalid' };
  }
  if (newPassword.length < MIN_PW) {
    return { ok: false, reason: 'password_too_short' };
  }
  const now = opts.now ?? new Date();
  const tokenHash = hashToken(rawToken);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    if (!row) return { ok: false, reason: 'invalid' as const };
    if (row.usedAt) return { ok: false, reason: 'used' as const };
    if (row.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: 'expired' as const };
    }

    // Atomic mark-as-used; if this returns 0 rows, someone else won the
    // race in a concurrent transaction.
    const claimed = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });
    if (claimed.length === 0) {
      return { ok: false, reason: 'used' as const };
    }

    const passwordHash = await bcryptHash(newPassword, 10);
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));

    void notifyPasswordChanged(row.userId, { source: 'self-service reset', changedAt: now });

    return { ok: true, userId: row.userId };
  });
}

export const __TEST = { TOKEN_PREFIX, DEFAULT_TTL_MS, MIN_PW, hashToken };
