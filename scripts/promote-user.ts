/**
 * Promote an existing user to the admin role.
 *
 * Usage:
 *   docker compose exec app npm run user:promote -- <email>
 *   npm run user:promote -- alice@example.com
 *
 * Admins can manage other users from /admin/users in the web UI. The first
 * existing user is auto-promoted by the schema migration; use this script to
 * grant the role to anyone else after the fact, or to recover from an
 * accidental demotion.
 */

import { pool } from '../lib/db/client';
import { setUserRole, UserAdminError } from '../lib/auth/user-admin';

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error('usage: npm run user:promote -- <email>');
    process.exit(2);
  }
  try {
    await setUserRole(email, 'admin');
    console.log(`[promote-user] ${email} is now an admin.`);
  } catch (err) {
    if (err instanceof UserAdminError) {
      console.error(`[promote-user] ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[promote-user] failed', err);
  process.exit(1);
});
