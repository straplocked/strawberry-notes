/**
 * Operator-side helpers for provisioning and resetting accounts from the CLI.
 *
 * Used by `scripts/create-user.ts` and `scripts/reset-password.ts`. Lives in
 * `lib/` (not `scripts/`) so it can be unit-tested with the rest of the suite.
 */

import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { notifyPasswordChanged } from '../email/notifications';
import { seedFirstRunContent } from './first-run';

export class UserAdminError extends Error {
  constructor(
    message: string,
    public code: 'invalid_email' | 'password_too_short' | 'email_taken' | 'not_found',
  ) {
    super(message);
    this.name = 'UserAdminError';
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PW = 8;

function normaliseEmail(raw: string): string {
  const e = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new UserAdminError(`invalid email: ${raw}`, 'invalid_email');
  return e;
}

function checkPassword(pw: string): void {
  if (pw.length < MIN_PW) {
    throw new UserAdminError(`password must be at least ${MIN_PW} characters`, 'password_too_short');
  }
}

/**
 * Create a user and seed the same `Journal` folder the public signup flow does.
 * Throws `UserAdminError('email_taken')` if the email is already registered.
 */
export async function createUser(
  rawEmail: string,
  password: string,
): Promise<{ id: string; email: string }> {
  const email = normaliseEmail(rawEmail);
  checkPassword(password);
  const passwordHash = await hash(password, 10);

  try {
    // Operator-created accounts come pre-confirmed — there's no email
    // round-trip to validate the address against, the operator vouches for it.
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, emailConfirmedAt: new Date() })
      .returning({ id: users.id, email: users.email });

    await seedFirstRunContent(user.id);

    return user;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message.includes('duplicate') || message.includes('unique')) {
      throw new UserAdminError(`email already registered: ${email}`, 'email_taken');
    }
    throw err;
  }
}

/**
 * Replace the password hash for an existing user. Throws
 * `UserAdminError('not_found')` if no row matches.
 */
export async function resetPassword(rawEmail: string, password: string): Promise<{ id: string }> {
  const email = normaliseEmail(rawEmail);
  checkPassword(password);
  const passwordHash = await hash(password, 10);

  const rows = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.email, email))
    .returning({ id: users.id });

  if (rows.length === 0) {
    throw new UserAdminError(`no user with email: ${email}`, 'not_found');
  }
  notifyPasswordChanged(rows[0].id, { source: 'operator CLI (npm run user:reset)' });
  return rows[0];
}

/** Generate a memorable random password (used when the operator omits one). */
export function generatePassword(bytes = 12): string {
  // 12 bytes → 16 base64url chars; well above the 8-char floor.
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
