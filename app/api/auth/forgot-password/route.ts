import { NextResponse } from 'next/server';
import { z } from 'zod';
import { issuePasswordResetTokenForEmail } from '@/lib/auth/password-reset';
import { isEmailConfigured, sendMail } from '@/lib/email/client';
import { passwordResetEmail } from '@/lib/email/templates';
import { getPublicBaseUrl } from '@/lib/http/public-url';
import { clientIp, rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

const Body = z.object({
  email: z.string().email().max(320),
});

// 3 reset requests per IP per hour. Stops the route from being used as a
// vector to spam someone else's inbox.
const FORGOT_LIMIT = { capacity: 3, refillPerSec: 3 / 3600 };

const RESET_TTL_HOURS = 1;

/**
 * POST /api/auth/forgot-password
 *
 * Always returns 200 regardless of whether the email is registered, so
 * the surface can't be used to enumerate accounts. When SMTP isn't
 * configured the response carries `{ ok: true, configured: false }` so
 * the page can show a helpful operator-pathway hint without leaking
 * which addresses exist.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`forgot:${clientIp(req)}`, FORGOT_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }

  // Issue a token if the user exists. Either way, return 200 — the caller
  // sees the same response.
  const issued = await issuePasswordResetTokenForEmail(parsed.data.email);
  if (issued) {
    const baseUrl = getPublicBaseUrl(req);
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(issued.token)}`;
    const message = passwordResetEmail({
      to: parsed.data.email,
      resetUrl,
      expiresInHours: RESET_TTL_HOURS,
    });
    // Fire-and-forget; we don't make the user wait on SMTP.
    void sendMail(message).catch((err) => {
      console.error('[forgot-password] sendMail error', err);
    });
  }

  return NextResponse.json({ ok: true, configured: true });
}
