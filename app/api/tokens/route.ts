import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { issueToken, listTokensForUser } from '@/lib/auth/token';

export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const tokens = await listTokensForUser(a.userId);
  return NextResponse.json(tokens);
}

const CreateBody = z.object({
  name: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const raw = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const issued = await issueToken(a.userId, parsed.data.name);
  // The raw `token` is returned to the caller ONCE; only the hash is retained server-side.
  return NextResponse.json({
    id: issued.id,
    name: parsed.data.name,
    prefix: issued.prefix,
    token: issued.token,
  });
}
