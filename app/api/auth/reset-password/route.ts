import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumePasswordResetToken } from '@/lib/auth/password-reset';
import { getPublicBaseUrl } from '@/lib/http/public-url';
import { clientIp, rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

const Body = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

// 10 attempts per IP per hour. Same envelope as the credentials sign-in.
const RESET_LIMIT = { capacity: 10, refillPerSec: 10 / 3600 };

/**
 * POST /api/auth/reset-password
 *
 * Validates the token + sets the new password atomically. The token is
 * single-use; a successful consume marks `usedAt` in the same transaction
 * that updates the user's password hash.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`reset:${clientIp(req)}`, RESET_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const result = await consumePasswordResetToken(parsed.data.token, parsed.data.password, {
    baseUrl: getPublicBaseUrl(req),
  });
  if (!result.ok) {
    const status = result.reason === 'password_too_short' ? 400 : 410;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
