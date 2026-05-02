import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Capture every request handed off to Auth.js so we can assert on the
// rewritten URL the wrapper produced.
const seen: { GET: NextRequest[]; POST: NextRequest[] } = { GET: [], POST: [] };

vi.mock('@/lib/auth', () => ({
  handlers: {
    GET: vi.fn(async (req: NextRequest) => {
      seen.GET.push(req);
      return new Response('ok-get', { status: 200 });
    }),
    POST: vi.fn(async (req: NextRequest) => {
      seen.POST.push(req);
      return new Response('ok-post', { status: 200 });
    }),
  },
}));

import { __resetRateLimitForTests } from '@/lib/http/rate-limit';
import { GET, POST, withUserFacingUrl } from './route';

const ORIGINAL_AUTH_URL = process.env.AUTH_URL;

beforeEach(() => {
  __resetRateLimitForTests();
  seen.GET = [];
  seen.POST = [];
  delete process.env.AUTH_URL;
});

afterEach(() => {
  if (ORIGINAL_AUTH_URL === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = ORIGINAL_AUTH_URL;
});

function makeReq(
  url: string,
  init?: { headers?: Record<string, string>; method?: string; body?: BodyInit },
): NextRequest {
  return new NextRequest(url, init);
}

describe('withUserFacingUrl', () => {
  it('rewrites the URL origin to the Host header for direct LAN access', () => {
    // Simulates what Next.js standalone builds inside the container.
    const req = makeReq('http://0.0.0.0:3000/api/auth/session', {
      headers: { host: '192.168.1.50:3200' },
    });
    const out = withUserFacingUrl(req);
    expect(new URL(out.url).origin).toBe('http://192.168.1.50:3200');
    expect(new URL(out.url).pathname).toBe('/api/auth/session');
  });

  it('honors X-Forwarded-Host + X-Forwarded-Proto for the proxy case', () => {
    const req = makeReq('http://0.0.0.0:3000/api/auth/callback/credentials?x=1', {
      headers: {
        host: '0.0.0.0:3000',
        'x-forwarded-host': 'notes.example.com',
        'x-forwarded-proto': 'https',
      },
    });
    const out = withUserFacingUrl(req);
    expect(new URL(out.url).origin).toBe('https://notes.example.com');
    expect(new URL(out.url).pathname).toBe('/api/auth/callback/credentials');
    expect(new URL(out.url).search).toBe('?x=1');
  });

  it('honors AUTH_URL when set, ignoring request headers', () => {
    process.env.AUTH_URL = 'https://notes.example.com';
    const req = makeReq('http://0.0.0.0:3000/api/auth/session', {
      headers: { host: '192.168.1.50:3200' },
    });
    const out = withUserFacingUrl(req);
    expect(new URL(out.url).origin).toBe('https://notes.example.com');
  });

  it('is a no-op when the incoming origin already matches the public origin', () => {
    // localhost dev: req.url uses localhost:3200 and there's no AUTH_URL/proxy.
    // getPublicBaseUrl returns http://localhost:3200, so the origins match.
    const req = makeReq('http://localhost:3200/api/auth/session', {
      headers: { host: 'localhost:3200' },
    });
    const out = withUserFacingUrl(req);
    // Same instance — no rebuild needed.
    expect(out).toBe(req);
  });

  it('preserves path and query on rewrite', () => {
    const req = makeReq('http://0.0.0.0:3000/api/auth/callback/credentials?error=Foo&code=bar', {
      headers: { host: '192.168.1.50:3200' },
    });
    const out = withUserFacingUrl(req);
    const rewritten = new URL(out.url);
    expect(rewritten.pathname).toBe('/api/auth/callback/credentials');
    expect(rewritten.searchParams.get('error')).toBe('Foo');
    expect(rewritten.searchParams.get('code')).toBe('bar');
  });
});

describe('GET /api/auth/[...nextauth]', () => {
  it('hands a rewritten request to handlers.GET', async () => {
    const req = makeReq('http://0.0.0.0:3000/api/auth/session', {
      headers: { host: '192.168.1.50:3200' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(seen.GET).toHaveLength(1);
    expect(new URL(seen.GET[0]!.url).origin).toBe('http://192.168.1.50:3200');
  });
});

describe('POST /api/auth/[...nextauth]', () => {
  it('hands a rewritten request to handlers.POST', async () => {
    const req = makeReq('http://0.0.0.0:3000/api/auth/signout', {
      method: 'POST',
      headers: { host: '192.168.1.50:3200' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(seen.POST).toHaveLength(1);
    expect(new URL(seen.POST[0]!.url).origin).toBe('http://192.168.1.50:3200');
  });

  it('rate-limits /callback/credentials after the burst is exhausted', async () => {
    const ip = '198.51.100.7';
    let lastStatus = 0;
    // Capacity is 10 — the 11th call from the same IP should be denied.
    for (let i = 0; i < 10; i++) {
      const req = makeReq('http://0.0.0.0:3000/api/auth/callback/credentials', {
        method: 'POST',
        headers: { host: '192.168.1.50:3200', 'x-forwarded-for': ip },
      });
      const res = await POST(req);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(200);

    const denied = await POST(
      makeReq('http://0.0.0.0:3000/api/auth/callback/credentials', {
        method: 'POST',
        headers: { host: '192.168.1.50:3200', 'x-forwarded-for': ip },
      }),
    );
    expect(denied.status).toBe(429);
    // Denied request must NOT reach Auth.js.
    expect(seen.POST).toHaveLength(10);
  });

  it('does not rate-limit non-credentials POSTs (e.g. signout)', async () => {
    const ip = '198.51.100.8';
    for (let i = 0; i < 20; i++) {
      const req = makeReq('http://0.0.0.0:3000/api/auth/signout', {
        method: 'POST',
        headers: { host: '192.168.1.50:3200', 'x-forwarded-for': ip },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }
    expect(seen.POST).toHaveLength(20);
  });
});
