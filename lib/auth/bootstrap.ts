import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import type { UserRole } from '../auth';

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
