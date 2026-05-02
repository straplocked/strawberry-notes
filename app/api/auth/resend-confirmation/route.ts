import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isEmailConfirmedByEmail,
  issueEmailConfirmationTokenForEmail,
} from '@/lib/auth/email-confirmation';
import { isEmailConfigured, sendMail } from '@/lib/email/client';
import { emailConfirmationEmail } from '@/lib/email/templates';
import { clientIp, rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

const Body = z.object({
  email: z.string().email().max(320),
});

// 3 resend attempts per IP per hour. Same envelope as forgot-password —
// stops the route from being weaponised as an inbox-spam vector.
const RESEND_LIMIT = { capacity: 3, refillPerSec: 3 / 3600 };

const TTL_HOURS = 24;

/**
 * POST /api/auth/resend-confirmation
 *
 * Always returns 200 regardless of whether the email is registered, to
 * keep the surface from enumerating accounts. Returns
 * `{ configured: false }` when SMTP is unset so the page can show a
 * helpful operator-pathway message.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`resend:${clientIp(req)}`, RESEND_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }

  const email = parsed.data.email.toLowerCase();

  // Skip if the user is already confirmed — no point re-issuing. Still
  // returns 200 so the response shape doesn't reveal which addresses
  // are confirmed-vs-pending.
  const alreadyConfirmed = await isEmailConfirmedByEmail(email);
  if (!alreadyConfirmed) {
    const issued = await issueEmailConfirmationTokenForEmail(email);
    if (issued) {
      const baseUrl = process.env.AUTH_URL?.trim() || 'http://localhost:3200';
      const confirmUrl = `${baseUrl.replace(/\/+$/, '')}/confirm-email?token=${encodeURIComponent(issued.token)}`;
      void sendMail(
        emailConfirmationEmail({
          to: email,
          confirmUrl,
          expiresInHours: TTL_HOURS,
        }),
      ).catch((err) => {
        console.error('[resend-confirmation] sendMail error', err);
      });
    }
  }

  return NextResponse.json({ ok: true, configured: true });
}
