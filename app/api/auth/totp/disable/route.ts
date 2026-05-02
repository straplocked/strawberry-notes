import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  findRecoveryCodeIndex,
  verifyTotpCode,
  type RecoveryCodeRecord,
} from '@/lib/auth/totp';
import { isTotpEnabled } from '@/lib/auth/mode';
import { rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

const Body = z.object({
  /** Current TOTP code OR a recovery code. We re-verify the second factor
   * to disable rather than asking for a password — OIDC/proxy users have
   * no password, and users mid-rotation might be the only ones who'd hit
   * this flow anyway. */
  code: z.string().min(1),
});

const TOTP_DISABLE_LIMIT = { capacity: 10, refillPerSec: 10 / 3600 };

/** POST /api/auth/totp/disable — clear TOTP enrollment. Requires re-auth
 * via a current TOTP code or an unused recovery code. */
export async function POST(req: Request) {
  if (!isTotpEnabled()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const limit = rateLimit(`totp-disable:${a.userId}`, TOTP_DISABLE_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const [user] = await db
    .select({
      totpSecret: users.totpSecret,
      totpRecoveryCodes: users.totpRecoveryCodes,
    })
    .from(users)
    .where(eq(users.id, a.userId));
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!user.totpSecret) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 409 });
  }

  const cleaned = parsed.data.code.replace(/\s+/g, '');
  let ok = false;
  if (/^\d{6}$/.test(cleaned)) {
    ok = await verifyTotpCode(user.totpSecret, cleaned);
  } else {
    const records = (user.totpRecoveryCodes as RecoveryCodeRecord[] | null) ?? [];
    const idx = await findRecoveryCodeIndex(records, cleaned);
    ok = idx >= 0;
  }
  if (!ok) return NextResponse.json({ error: 'bad_code' }, { status: 400 });

  await db
    .update(users)
    .set({
      totpSecret: null,
      totpEnrolledAt: null,
      totpRecoveryCodes: null,
    })
    .where(eq(users.id, a.userId));

  return NextResponse.json({ ok: true });
}
