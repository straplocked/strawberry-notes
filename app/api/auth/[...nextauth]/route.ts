import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { clientIp, rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';

export const { GET } = handlers;

// 10 sign-in attempts per IP per minute. Sustained refill is gentle so a
// scripted brute-force burns the bucket immediately and pays the Retry-After.
// Only the credentials callback is gated — other Auth.js POSTs (CSRF token
// fetch, providers list, etc.) bypass the limit, since denying those breaks
// the legitimate sign-in flow.
const LOGIN_LIMIT = { capacity: 10, refillPerSec: 10 / 60 };

export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/callback/credentials')) {
    const limit = rateLimit(`login:${clientIp(req)}`, LOGIN_LIMIT);
    if (!limit.ok) return rateLimitResponse(limit);
  }
  return handlers.POST(req);
}
