/**
 * Provision a new user account from the operator's shell.
 *
 * Usage:
 *   docker compose exec app npm run user:create -- <email> [password]
 *   npm run user:create -- alice@example.com hunter2hunter
 *
 * If the password argument is omitted, a random one is generated and printed.
 * Either way the password is shown exactly once on stdout — copy it into your
 * password manager and hand it to the user out-of-band.
 */

import { pool } from '../lib/db/client';
import { createUser, generatePassword, UserAdminError } from '../lib/auth/user-admin';

async function main() {
  const [email, providedPassword] = process.argv.slice(2);
  if (!email) {
    console.error('usage: npm run user:create -- <email> [password]');
    process.exit(2);
  }

  const password = providedPassword ?? generatePassword();
  const generated = !providedPassword;

  try {
    const user = await createUser(email, password);
    console.log(`[create-user] created user ${user.email} (${user.id})`);
    if (generated) {
      console.log(`[create-user] generated password: ${password}`);
      console.log('[create-user] hand this to the user, then ask them to sign in once and rotate it.');
    } else {
      console.log('[create-user] password set from argument.');
    }
  } catch (err) {
    if (err instanceof UserAdminError) {
      console.error(`[create-user] ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[create-user] failed', err);
  process.exit(1);
});
