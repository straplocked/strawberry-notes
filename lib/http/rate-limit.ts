/**
 * In-process token-bucket rate limiter for auth-adjacent endpoints.
 *
 * Why this exists: a public Strawberry Notes deployment with `ALLOW_PUBLIC_SIGNUP=true`
 * is a target for credential-stuffing and signup spam. We do not want to require
 * Redis for a single-container self-host story, so this limiter holds state in
 * a Map and is honest about its scope: limits are per-process, not global.
 *
 * Operators running multiple replicas should add an upstream limiter at their
 * reverse proxy (Caddy / nginx / Cloudflare) — this module is a defense-in-depth
 * layer, not a substitute.
 */

import { NextResponse } from 'next/server';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function maybeSweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  // Drop any bucket that has been idle for >5 min — cheap, prevents unbounded growth.
  const idleCutoff = now - 5 * 60_000;
  for (const [k, b] of buckets) {
    if (b.lastRefill < idleCutoff) buckets.delete(k);
  }
}

export interface RateLimitOpts {
  /** Maximum burst — also the starting fill of a fresh bucket. */
  capacity: number;
  /** Sustained refill rate in tokens per second. */
  refillPerSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Consume one token for `key`. Returns whether the call is allowed and, on
 * denial, the number of seconds the caller should wait before retrying.
 */
export function rateLimit(key: string, opts: RateLimitOpts): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);

  let b = buckets.get(key);
  if (!b) {
    b = { tokens: opts.capacity, lastRefill: now };
    buckets.set(key, b);
  } else {
    const elapsedSec = (now - b.lastRefill) / 1000;
    if (elapsedSec > 0) {
      b.tokens = Math.min(opts.capacity, b.tokens + elapsedSec * opts.refillPerSec);
      b.lastRefill = now;
    }
  }

  if (b.tokens < 1) {
    const retryAfterSec = Math.max(1, Math.ceil((1 - b.tokens) / opts.refillPerSec));
    return { ok: false, remaining: 0, retryAfterSec };
  }
  b.tokens -= 1;
  return { ok: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 };
}

/**
 * Best-effort client IP extraction. Trusts X-Forwarded-For only because we
 * assume operators run this behind a reverse proxy that sets it. For the
 * unproxied dev case, falls back to a constant.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

/** Standard 429 response. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'rate_limit_exceeded', retryAfterSec: result.retryAfterSec },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSec),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

/** Test-only: clear all buckets between cases. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
  lastSweep = 0;
}
