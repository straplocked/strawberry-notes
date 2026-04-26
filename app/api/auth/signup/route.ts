import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { seedFirstRunContent } from '@/lib/auth/first-run';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';
import { clientIp, rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// 5 signups per IP per hour, with a small burst.
const SIGNUP_LIMIT = { capacity: 5, refillPerSec: 5 / 3600 };

export async function POST(req: Request) {
  if (!isPublicSignupEnabled()) {
    // Closed deployment: behave as if the route doesn't exist so we don't
    // advertise it in error messages.
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const limit = rateLimit(`signup:${clientIp(req)}`, SIGNUP_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hash(parsed.data.password, 10);

  try {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email });

    // First-run: seed the Journal folder + a Welcome note so the empty
    // state doubles as a feature tour.
    await seedFirstRunContent(user.id);

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message.includes('duplicate') || message.includes('unique')) {
      return NextResponse.json({ error: 'Email is already registered' }, { status: 409 });
    }
    console.error('signup error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
