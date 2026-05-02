import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { hashRecoveryCodes, verifyTotpCode } from '@/lib/auth/totp';
import { isTotpEnabled } from '@/lib/auth/mode';
import { rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

const Body = z.object({
  secret: z.string().min(16),
  code: z.string().min(1),
  recoveryCodes: z.array(z.string().min(1)).length(8),
});

const TOTP_ENABLE_LIMIT = { capacity: 10, refillPerSec: 10 / 3600 };

/** POST /api/auth/totp/enable — confirm enrollment by submitting a valid
 * code generated from the secret returned by /setup. Persists the secret
 * + bcrypt-hashed recovery codes. */
export async function POST(req: Request) {
  if (!isTotpEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const limit = rateLimit(`totp-enable:${a.userId}`, TOTP_ENABLE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const [user] = await db
    .select({ totpSecret: users.totpSecret })
    .from(users)
    .where(eq(users.id, a.userId));
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (user.totpSecret) {
    return NextResponse.json({ error: 'already_enrolled' }, { status: 409 });
  }

  if (!(await verifyTotpCode(parsed.data.secret, parsed.data.code))) {
    return NextResponse.json({ error: 'bad_code' }, { status: 400 });
  }

  const recoveryHashes = await hashRecoveryCodes(parsed.data.recoveryCodes);
  await db
    .update(users)
    .set({
      totpSecret: parsed.data.secret,
      totpEnrolledAt: new Date(),
      totpRecoveryCodes: recoveryHashes,
    })
    .where(eq(users.id, a.userId));

  return NextResponse.json({ ok: true });
}
