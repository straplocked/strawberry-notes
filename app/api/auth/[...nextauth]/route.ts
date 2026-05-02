import { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { getPublicBaseUrl } from '@/lib/http/public-url';
import { clientIp, rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

// 10 sign-in attempts per IP per minute. Sustained refill is gentle so a
// scripted brute-force burns the bucket immediately and pays the Retry-After.
// Only the credentials callback is gated — other Auth.js POSTs (CSRF token
// fetch, providers list, etc.) bypass the limit, since denying those breaks
// the legitimate sign-in flow.
const LOGIN_LIMIT = { capacity: 10, refillPerSec: 10 / 60 };

// Next.js standalone builds req.url from the runner's HOSTNAME:PORT env vars
// (`http://0.0.0.0:3000/...`), not from the request's Host header. Auth.js
// uses `options.url.origin` everywhere it constructs an absolute URL, so
// leaving req.url alone leaks the container's internal listen socket into
// auth redirects and JSON response payloads — bouncing LAN/proxy users to
// `http://0.0.0.0:3000/...` after sign-in. Rewrite the URL via
// getPublicBaseUrl (AUTH_URL → X-Forwarded-Host → Host) so Auth.js sees
// the user-facing origin.
export function withUserFacingUrl(req: NextRequest): NextRequest {
  const incoming = new URL(req.url);
  const facing = new URL(getPublicBaseUrl(req));
  if (incoming.origin === facing.origin) return req;
  const rewritten = new URL(incoming.pathname + incoming.search, facing);
  return new NextRequest(rewritten, req);
}

export async function GET(req: NextRequest) {
  return handlers.GET(withUserFacingUrl(req));
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/callback/credentials')) {
    const limit = rateLimit(`login:${clientIp(req)}`, LOGIN_LIMIT);
    if (!limit.ok) return rateLimitResponse(limit);
  }
  return handlers.POST(withUserFacingUrl(req));
}
