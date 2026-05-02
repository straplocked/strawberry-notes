import { afterEach, describe, expect, it } from 'vitest';
import { isProxyRequestTrusted, PROXY_SECRET_HEADER } from './proxy';

afterEach(() => {
  delete process.env.PROXY_AUTH_SHARED_SECRET;
});

function headers(map: Record<string, string>): { get: (k: string) => string | null } {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v;
  return { get: (k: string) => lower[k.toLowerCase()] ?? null };
}

describe('isProxyRequestTrusted', () => {
  it('returns false when no shared secret is configured', () => {
    expect(isProxyRequestTrusted(headers({ [PROXY_SECRET_HEADER]: 'anything' }))).toBe(false);
  });

  it('returns false when the header is missing', () => {
    process.env.PROXY_AUTH_SHARED_SECRET = 'expected';
    expect(isProxyRequestTrusted(headers({}))).toBe(false);
  });

  it('returns false on mismatched secret', () => {
    process.env.PROXY_AUTH_SHARED_SECRET = 'expected';
    expect(isProxyRequestTrusted(headers({ [PROXY_SECRET_HEADER]: 'wrong' }))).toBe(false);
  });

  it('returns true on matching secret', () => {
    process.env.PROXY_AUTH_SHARED_SECRET = 'expected';
    expect(isProxyRequestTrusted(headers({ [PROXY_SECRET_HEADER]: 'expected' }))).toBe(true);
  });

  it('compares constant-time (length differences fail without leaking timing)', () => {
    process.env.PROXY_AUTH_SHARED_SECRET = 'expected';
    expect(isProxyRequestTrusted(headers({ [PROXY_SECRET_HEADER]: 'expecte' }))).toBe(false);
    expect(isProxyRequestTrusted(headers({ [PROXY_SECRET_HEADER]: 'expectedX' }))).toBe(false);
  });
});
