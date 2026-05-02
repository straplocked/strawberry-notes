/**
 * Demote an existing admin back to a regular user.
 *
 * Usage:
 *   docker compose exec app npm run user:demote -- <email>
 *   npm run user:demote -- alice@example.com
 *
 * Refuses to demote the only remaining admin so the instance never ends up
 * unmanageable. Use `npm run user:promote -- other@example.com` first if
 * that's where you'd like the admin to land.
 */

import { pool } from '../lib/db/client';
import { setUserRole, UserAdminError } from '../lib/auth/user-admin';

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error('usage: npm run user:demote -- <email>');
    process.exit(2);
  }
  try {
    await setUserRole(email, 'user');
    console.log(`[demote-user] ${email} is now a regular user.`);
  } catch (err) {
    if (err instanceof UserAdminError) {
      console.error(`[demote-user] ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[demote-user] failed', err);
  process.exit(1);
});
