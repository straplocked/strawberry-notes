import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeEmailConfirmationToken } from '@/lib/auth/email-confirmation';
import { clientIp, rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

const Body = z.object({
  token: z.string().min(1).max(200),
});

// 10 attempts per IP per hour.
const CONFIRM_LIMIT = { capacity: 10, refillPerSec: 10 / 3600 };

/**
 * POST /api/auth/confirm-email
 *
 * Consumes a `ecf_<64-hex>` token issued by the signup flow and flips
 * `users.email_confirmed_at` to now() in a single transaction.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`confirm:${clientIp(req)}`, CONFIRM_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const result = await consumeEmailConfirmationToken(parsed.data.token);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 410 });
  }
  return NextResponse.json({ ok: true });
}
