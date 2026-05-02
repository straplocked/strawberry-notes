/**
 * Operator-side helpers for provisioning and resetting accounts from the CLI.
 *
 * Used by `scripts/create-user.ts` and `scripts/reset-password.ts`. Lives in
 * `lib/` (not `scripts/`) so it can be unit-tested with the rest of the suite.
 */

import { hash } from 'bcryptjs';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import type { UserRole } from '../auth';
import { notifyPasswordChanged } from '../email/notifications';
import { seedFirstRunContent } from './first-run';

export class UserAdminError extends Error {
  constructor(
    message: string,
    public code:
      | 'invalid_email'
      | 'password_too_short'
      | 'email_taken'
      | 'not_found'
      | 'last_admin'
      | 'self_action',
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
  // Awaited so the CLI doesn't `pool.end()` before the email goes out.
  // Web callers don't actually call `resetPassword` — they call
  // `consumePasswordResetToken`, which keeps the DB pool alive.
  await notifyPasswordChanged(rows[0].id, { source: 'operator CLI (npm run user:reset)' });
  return rows[0];
}

/** Set a user's role by email (CLI promote / demote). */
export async function setUserRole(rawEmail: string, role: UserRole): Promise<{ id: string }> {
  const email = normaliseEmail(rawEmail);
  // Block demoting the last admin: would leave the instance unmanageable.
  if (role === 'user') {
    const target = await findUserByEmail(email);
    if (!target) throw new UserAdminError(`no user with email: ${email}`, 'not_found');
    if (target.role === 'admin') {
      const admins = await countAdmins();
      if (admins <= 1) {
        throw new UserAdminError('cannot demote the only remaining admin', 'last_admin');
      }
    }
  }
  const rows = await db
    .update(users)
    .set({ role })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (rows.length === 0) {
    throw new UserAdminError(`no user with email: ${email}`, 'not_found');
  }
  return rows[0];
}

/** Set or clear `disabledAt` on an existing user (admin UI). */
export async function setUserDisabled(
  userId: string,
  disabled: boolean,
): Promise<{ id: string; disabledAt: Date | null }> {
  if (disabled) {
    const target = await findUserById(userId);
    if (!target) throw new UserAdminError(`no user with id: ${userId}`, 'not_found');
    if (target.role === 'admin') {
      const admins = await countAdmins({ excludeDisabled: true });
      if (admins <= 1) {
        throw new UserAdminError('cannot disable the only remaining admin', 'last_admin');
      }
    }
  }
  const [row] = await db
    .update(users)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(users.id, userId))
    .returning({ id: users.id, disabledAt: users.disabledAt });
  if (!row) throw new UserAdminError(`no user with id: ${userId}`, 'not_found');
  return row;
}

/** Hard-delete a user (cascades via existing FKs). Refuses to delete the
 * only remaining admin or the user themselves. */
export async function deleteUser(
  userId: string,
  opts: { actingUserId: string },
): Promise<{ id: string }> {
  if (userId === opts.actingUserId) {
    throw new UserAdminError('cannot delete yourself from /admin/users', 'self_action');
  }
  const target = await findUserById(userId);
  if (!target) throw new UserAdminError(`no user with id: ${userId}`, 'not_found');
  if (target.role === 'admin') {
    const admins = await countAdmins();
    if (admins <= 1) {
      throw new UserAdminError('cannot delete the only remaining admin', 'last_admin');
    }
  }
  const [row] = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return row;
}

/** Reset password for a user found by id. Returns the freshly-set password
 * for one-time display in the admin UI. */
export async function resetPasswordById(
  userId: string,
  password?: string,
): Promise<{ id: string; password: string; generated: boolean }> {
  const generated = !password;
  const finalPassword = password ?? generatePassword();
  checkPassword(finalPassword);
  const passwordHash = await hash(finalPassword, 10);
  const [row] = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!row) throw new UserAdminError(`no user with id: ${userId}`, 'not_found');
  await notifyPasswordChanged(row.id, { source: 'admin UI' });
  return { id: row.id, password: finalPassword, generated };
}

async function findUserByEmail(
  email: string,
): Promise<{ id: string; role: UserRole; disabledAt: Date | null } | null> {
  const [row] = await db
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.email, email));
  return row ? { id: row.id, role: row.role as UserRole, disabledAt: row.disabledAt } : null;
}

async function findUserById(
  id: string,
): Promise<{ id: string; role: UserRole; disabledAt: Date | null } | null> {
  const [row] = await db
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, id));
  return row ? { id: row.id, role: row.role as UserRole, disabledAt: row.disabledAt } : null;
}

/** Number of admin accounts, optionally excluding disabled ones. */
export async function countAdmins(opts: { excludeDisabled?: boolean } = {}): Promise<number> {
  const where = opts.excludeDisabled
    ? and(eq(users.role, 'admin'), isNull(users.disabledAt))
    : eq(users.role, 'admin');
  const rows = await db.select({ n: count() }).from(users).where(where);
  return Number(rows[0]?.n ?? 0);
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
