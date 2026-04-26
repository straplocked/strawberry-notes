import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimitForTests, clientIp, rateLimit, rateLimitResponse } from './rate-limit';

beforeEach(() => {
  __resetRateLimitForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-26T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit token bucket', () => {
  it('admits up to `capacity` requests immediately, then denies', () => {
    const opts = { capacity: 3, refillPerSec: 0.1 };
    expect(rateLimit('ip:1', opts).ok).toBe(true);
    expect(rateLimit('ip:1', opts).ok).toBe(true);
    expect(rateLimit('ip:1', opts).ok).toBe(true);
    const denied = rateLimit('ip:1', opts);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('refills tokens over time at the configured rate', () => {
    const opts = { capacity: 2, refillPerSec: 1 };
    rateLimit('ip:2', opts);
    rateLimit('ip:2', opts);
    expect(rateLimit('ip:2', opts).ok).toBe(false);

    // Advance 2 seconds → refilled to 2 tokens (capped).
    vi.advanceTimersByTime(2000);
    expect(rateLimit('ip:2', opts).ok).toBe(true);
    expect(rateLimit('ip:2', opts).ok).toBe(true);
    expect(rateLimit('ip:2', opts).ok).toBe(false);
  });

  it('isolates buckets by key', () => {
    const opts = { capacity: 1, refillPerSec: 0.01 };
    expect(rateLimit('ip:a', opts).ok).toBe(true);
    expect(rateLimit('ip:a', opts).ok).toBe(false);
    // A different IP starts with a fresh bucket.
    expect(rateLimit('ip:b', opts).ok).toBe(true);
  });

  it('caps at `capacity` even after long idle periods', () => {
    const opts = { capacity: 5, refillPerSec: 1 };
    rateLimit('ip:c', opts); // 4 left
    vi.advanceTimersByTime(60_000); // refill would yield 60 tokens — capped at 5
    for (let i = 0; i < 5; i++) expect(rateLimit('ip:c', opts).ok).toBe(true);
    expect(rateLimit('ip:c', opts).ok).toBe(false);
  });
});

describe('clientIp', () => {
  it('uses X-Forwarded-For first hop when present', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '203.0.113.5, 198.51.100.1' },
    });
    expect(clientIp(req)).toBe('203.0.113.5');
  });

  it('falls back to X-Real-IP', () => {
    const req = new Request('http://x', { headers: { 'x-real-ip': '203.0.113.7' } });
    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it('returns "unknown" when neither header is set', () => {
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});

describe('rateLimitResponse', () => {
  it('returns 429 with Retry-After', async () => {
    const res = rateLimitResponse({ ok: false, remaining: 0, retryAfterSec: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    const body = await res.json();
    expect(body.error).toBe('rate_limit_exceeded');
    expect(body.retryAfterSec).toBe(42);
  });
});
