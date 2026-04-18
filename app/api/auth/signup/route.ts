import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { folders, users } from '@/lib/db/schema';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(req: Request) {
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

    // First-run: seed a single folder so the empty state isn't empty.
    await db.insert(folders).values({
      userId: user.id,
      name: 'Journal',
      color: '#e33d4e',
      position: 0,
    });

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
