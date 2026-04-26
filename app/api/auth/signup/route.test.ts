import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  insertResult: [] as Array<{ id: string; email: string }>,
  insertThrows: null as Error | null,
  inserts: 0,
};

vi.mock('@/lib/db/client', () => {
  return {
    db: {
      insert: () => ({
        values: () => {
          state.inserts += 1;
          if (state.insertThrows) {
            const err = state.insertThrows;
            return { returning: () => Promise.reject(err) };
          }
          return { returning: () => Promise.resolve(state.insertResult) };
        },
      }),
    },
  };
});

import { __resetRateLimitForTests } from '@/lib/http/rate-limit';
import { POST } from './route';

beforeEach(() => {
  __resetRateLimitForTests();
  state.insertResult = [];
  state.insertThrows = null;
  state.inserts = 0;
  process.env.ALLOW_PUBLIC_SIGNUP = 'true';
});

afterEach(() => {
  delete process.env.ALLOW_PUBLIC_SIGNUP;
});

function postJson(body: unknown, ip = '203.0.113.1') {
  return new Request('http://localhost:3200/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/signup', () => {
  it('returns 404 when ALLOW_PUBLIC_SIGNUP is not set', async () => {
    delete process.env.ALLOW_PUBLIC_SIGNUP;
    const res = await POST(postJson({ email: 'a@example.com', password: 'hunter2hunter' }));
    expect(res.status).toBe(404);
    expect(state.inserts).toBe(0);
  });

  it('returns 400 for malformed payloads', async () => {
    const res = await POST(postJson({ email: 'not-an-email', password: 'hunter2hunter' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for short passwords', async () => {
    const res = await POST(postJson({ email: 'a@example.com', password: 'short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/8 characters/);
  });

  it('creates the user and seeds a Journal folder + Welcome note on success', async () => {
    state.insertResult = [{ id: 'u-1', email: 'a@example.com' }];
    const res = await POST(postJson({ email: 'A@Example.com', password: 'hunter2hunter' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, userId: 'u-1' });
    // Three inserts: user + folder + welcome note (via seedFirstRunContent).
    expect(state.inserts).toBe(3);
  });

  it('returns 409 when the email is already registered', async () => {
    state.insertThrows = new Error('duplicate key value violates unique constraint');
    const res = await POST(postJson({ email: 'a@example.com', password: 'hunter2hunter' }));
    expect(res.status).toBe(409);
  });

  it('rate-limits a single IP after the burst is exhausted', async () => {
    state.insertResult = [{ id: 'u-x', email: 'x@example.com' }];
    let lastStatus = 0;
    // Capacity is 5 — the 6th call from the same IP should be denied.
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        postJson({ email: `a${i}@example.com`, password: 'hunter2hunter' }, '198.51.100.9'),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(200);

    const denied = await POST(
      postJson({ email: 'a5@example.com', password: 'hunter2hunter' }, '198.51.100.9'),
    );
    expect(denied.status).toBe(429);
    expect(denied.headers.get('Retry-After')).toBeTruthy();
  });

  it('isolates the rate limit per IP', async () => {
    state.insertResult = [{ id: 'u-y', email: 'y@example.com' }];
    for (let i = 0; i < 5; i++) {
      await POST(
        postJson({ email: `b${i}@example.com`, password: 'hunter2hunter' }, '198.51.100.10'),
      );
    }
    const fromOtherIp = await POST(
      postJson({ email: 'fresh@example.com', password: 'hunter2hunter' }, '198.51.100.11'),
    );
    expect(fromOtherIp.status).toBe(200);
  });
});
