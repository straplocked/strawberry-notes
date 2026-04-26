/**
 * Operator-driven password reset. There is deliberately no SMTP-based
 * self-service flow in v1 — running this CLI is the documented recovery path.
 *
 * Usage:
 *   docker compose exec app npm run user:reset -- <email> [new-password]
 *
 * If the new-password argument is omitted, a random password is generated and
 * printed. Hand it to the user out-of-band; they should sign in once and
 * rotate it via the settings page (token + email change UI lands later — for
 * now, rotation is also done via this script).
 */

import { pool } from '../lib/db/client';
import { generatePassword, resetPassword, UserAdminError } from '../lib/auth/user-admin';

async function main() {
  const [email, providedPassword] = process.argv.slice(2);
  if (!email) {
    console.error('usage: npm run user:reset -- <email> [new-password]');
    process.exit(2);
  }

  const password = providedPassword ?? generatePassword();
  const generated = !providedPassword;

  try {
    const user = await resetPassword(email, password);
    console.log(`[reset-password] password updated for user ${user.id}`);
    if (generated) {
      console.log(`[reset-password] new password: ${password}`);
    } else {
      console.log('[reset-password] password set from argument.');
    }
    console.log('[reset-password] existing JWT sessions remain valid until they expire.');
  } catch (err) {
    if (err instanceof UserAdminError) {
      console.error(`[reset-password] ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[reset-password] failed', err);
  process.exit(1);
});
