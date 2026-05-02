import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdminUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  UserAdminError,
  createUser,
  generatePassword,
  setUserRole,
} from '@/lib/auth/user-admin';
import { rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

/** GET /api/admin/users — list every user with their admin-relevant fields. */
export async function GET() {
  const a = await requireAdminUserId();
  if (!a.ok) return a.response;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      disabledAt: users.disabledAt,
      emailConfirmedAt: users.emailConfirmedAt,
      totpEnrolledAt: users.totpEnrolledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));

  return NextResponse.json(rows);
}

const CreateBody = z.object({
  email: z.string().email().max(320),
  /** Optional — when omitted, a random password is generated and returned. */
  password: z.string().min(8).max(200).optional(),
  /** Defaults to 'user'. */
  role: z.enum(['user', 'admin']).optional(),
});

// 60 admin-create operations per acting admin per hour. Plenty for normal
// onboarding bursts; stops a runaway script.
const ADMIN_LIMIT = { capacity: 60, refillPerSec: 60 / 3600 };

/** POST /api/admin/users — create a new user. Returns the password if the
 * server generated one (one-time view). */
export async function POST(req: Request) {
  const a = await requireAdminUserId();
  if (!a.ok) return a.response;

  const limit = rateLimit(`admin-users:${a.userId}`, ADMIN_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const password = parsed.data.password ?? generatePassword();
  const generated = !parsed.data.password;
  try {
    const user = await createUser(parsed.data.email, password);
    if (parsed.data.role === 'admin') {
      await setUserRole(parsed.data.email, 'admin');
    }
    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: parsed.data.role ?? 'user',
      password: generated ? password : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UserAdminError) {
    const status =
      err.code === 'not_found'
        ? 404
        : err.code === 'email_taken' || err.code === 'last_admin'
          ? 409
          : err.code === 'self_action'
            ? 403
            : 400;
    return NextResponse.json({ error: err.code, message: err.message }, { status });
  }
  console.error('[api/admin/users] unexpected', err);
  return NextResponse.json({ error: 'internal' }, { status: 500 });
}
