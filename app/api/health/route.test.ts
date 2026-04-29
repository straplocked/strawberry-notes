import { describe, expect, it, vi, beforeEach } from 'vitest';

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: executeMock,
  },
}));

import { GET } from './route';

describe('GET /api/health', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('returns 200 + { ok: true, db: "up" } when Postgres responds', async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, db: 'up' });
  });

  it('returns 503 + { ok: false, db: "down" } when Postgres rejects', async () => {
    executeMock.mockRejectedValueOnce(new Error('connection refused'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.db).toBe('down');
    expect(body.error).toBe('connection refused');
  });

  it('returns 503 when the ping exceeds the timeout', async () => {
    executeMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ rows: [] }), 5000)),
    );
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/timeout/i);
  }, 3000);
});
