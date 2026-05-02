import { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { clientIp, rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

// 10 sign-in attempts per IP per minute. Sustained refill is gentle so a
// scripted brute-force burns the bucket immediately and pays the Retry-After.
// Only the credentials callback is gated — other Auth.js POSTs (CSRF token
// fetch, providers list, etc.) bypass the limit, since denying those breaks
// the legitimate sign-in flow.
const LOGIN_LIMIT = { capacity: 10, refillPerSec: 10 / 60 };

// Resolve the user-facing origin in the same precedence Auth.js itself would
// honor if it could: AUTH_URL → X-Forwarded-Host (+ X-Forwarded-Proto) →
// the request's own Host header. Returns null when none of those are usable
// (no Host header, no env), in which case the caller leaves the request alone.
function userFacingOrigin(req: NextRequest): string | null {
  const env = process.env.AUTH_URL?.trim();
  if (env) {
    try {
      return new URL(env).origin;
    } catch {
      // Malformed AUTH_URL — fall through to header detection.
    }
  }
  const fwdHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (fwdHost) {
    return `${fwdProto || 'https'}://${fwdHost}`;
  }
  const host = req.headers.get('host')?.trim();
  if (host) {
    let proto = fwdProto;
    if (!proto) {
      try {
        proto = new URL(req.url).protocol.replace(/:$/, '');
      } catch {
        // ignore — fall back to http
      }
    }
    return `${proto || 'http'}://${host}`;
  }
  return null;
}

// Next.js standalone builds req.url from the runner's HOSTNAME:PORT env vars
// (`http://0.0.0.0:3000/...`), not from the request's Host header. Auth.js
// uses `options.url.origin` everywhere it constructs an absolute URL, so
// leaving req.url alone leaks the container's internal listen socket into
// auth redirects and JSON response payloads — bouncing LAN/proxy users to
// `http://0.0.0.0:3000/...` after sign-in. Rewrite the URL so Auth.js sees
// the user-facing origin.
export function withUserFacingUrl(req: NextRequest): NextRequest {
  const facingOrigin = userFacingOrigin(req);
  if (!facingOrigin) return req;
  const incoming = new URL(req.url);
  if (incoming.origin === facingOrigin) return req;
  const rewritten = new URL(incoming.pathname + incoming.search, facingOrigin);
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
