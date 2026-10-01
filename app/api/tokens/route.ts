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
  // Defaults to 'read' when the caller omits it (Chris's call: new tokens
  // default to read-only). The Tokens UI's create-token form always sends
  // an explicit value from its scope selector, itself defaulted to Read —
  // this default only matters for a direct API call that skips the field.
  scope: z.enum(['read', 'write']).default('read'),
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

  const issued = await issueToken(a.userId, parsed.data.name, parsed.data.scope, {
    baseUrl: getPublicBaseUrl(req),
  });
  // The raw `token` is returned to the caller ONCE; only the hash is retained server-side.
  return NextResponse.json({
    id: issued.id,
    name: parsed.data.name,
    prefix: issued.prefix,
    scope: issued.scope,
    token: issued.token,
  });
}
