import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { issueToken, listTokensForUser } from '@/lib/auth/token';
import { getPublicBaseUrl } from '@/lib/http/public-url';
import { rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const tokens = await listTokensForUser(a.userId);
  return NextResponse.json(tokens);
}

const CreateBody = z.object({
  name: z.string().min(1).max(80),
});

// 20 token mints per user per hour. Token creation is rare in normal use and
// should never be hot — this stops a runaway script from filling api_tokens.
const TOKEN_LIMIT = { capacity: 20, refillPerSec: 20 / 3600 };

export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const limit = rateLimit(`tokens:${a.userId}`, TOKEN_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const issued = await issueToken(a.userId, parsed.data.name, {
    baseUrl: getPublicBaseUrl(req),
  });
  // The raw `token` is returned to the caller ONCE; only the hash is retained server-side.
  return NextResponse.json({
    id: issued.id,
    name: parsed.data.name,
    prefix: issued.prefix,
    token: issued.token,
  });
}
