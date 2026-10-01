/**
 * Task 04 PR B: POST /api/tokens defaults a new token's scope to 'read' when
 * the caller omits it, and honours an explicit 'write'. The Tokens UI always
 * sends an explicit value (its selector defaults to Read), so this default
 * only bites a direct API call that skips the field.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  insertedValues: [] as Array<Record<string, unknown>>,
};

vi.mock('@/lib/auth/require', () => ({
  requireUserId: vi.fn(async () => ({ ok: true, userId: 'user-1' })),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        state.insertedValues.push(v);
        return { returning: () => Promise.resolve([{ id: 'token-1' }]) };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/email/notifications', () => ({
  notifyTokenCreated: vi.fn(async () => {}),
}));

import { __resetRateLimitForTests } from '@/lib/http/rate-limit';
import { POST } from './route';

function postJson(body: unknown) {
  return new Request('http://localhost:3200/api/tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  __resetRateLimitForTests();
  state.insertedValues = [];
});

describe('POST /api/tokens — default scope (task 04 PR B)', () => {
  it('defaults to read when scope is omitted', async () => {
    const res = await POST(postJson({ name: 'Unscoped client' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toBe('read');
    expect(state.insertedValues).toHaveLength(1);
    expect(state.insertedValues[0]).toMatchObject({ scope: 'read' });
  });

  it('honours an explicit write scope', async () => {
    const res = await POST(postJson({ name: 'Claude Desktop', scope: 'write' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toBe('write');
    expect(state.insertedValues[0]).toMatchObject({ scope: 'write' });
  });

  it('rejects an invalid scope value', async () => {
    const res = await POST(postJson({ name: 'Bad client', scope: 'admin' }));
    expect(res.status).toBe(400);
  });
});
