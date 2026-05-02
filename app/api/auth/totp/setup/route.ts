import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { generateEnrollmentMaterial } from '@/lib/auth/totp';
import { isTotpEnabled } from '@/lib/auth/mode';
import { rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

// 20 setup-material requests per signed-in user per hour. The user might
// re-roll a secret a few times before scanning successfully; this still
// blocks any runaway script.
const TOTP_SETUP_LIMIT = { capacity: 20, refillPerSec: 20 / 3600 };

/** GET /api/auth/totp/setup — return a fresh secret + QR + recovery codes.
 * Does NOT persist anything; the user confirms by entering a valid code at
 * /api/auth/totp/enable, which is when we write to the DB. */
export async function GET() {
  if (!isTotpEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const limit = rateLimit(`totp-setup:${a.userId}`, TOTP_SETUP_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const [user] = await db
    .select({ email: users.email, totpSecret: users.totpSecret })
    .from(users)
    .where(eq(users.id, a.userId));
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (user.totpSecret) {
    return NextResponse.json(
      { error: 'already_enrolled', message: 'TOTP is already enrolled. Disable it first.' },
      { status: 409 },
    );
  }

  const material = await generateEnrollmentMaterial(user.email);
  return NextResponse.json(material);
}
