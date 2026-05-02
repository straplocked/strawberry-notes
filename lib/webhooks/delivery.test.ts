import { describe, expect, it, vi, beforeEach } from 'vitest';

interface UpdateCall {
  set: Record<string, unknown>;
}
const updateCalls: UpdateCall[] = [];

vi.mock('../db/client', () => {
  const updateChain = (set: Record<string, unknown>) => ({
    where: () => ({
      // markFailure() reads .returning() to know whether the row crossed
      // the dead-letter threshold; success path doesn't await it. Return
      // an empty array so the dead-letter notify never fires under test.
      returning: () => {
        updateCalls.push({ set });
        return Promise.resolve([] as Array<Record<string, unknown>>);
      },
      // markSuccess() awaits the where() promise directly.
      then: (resolve: (v: unknown) => void) => {
        updateCalls.push({ set });
        resolve(undefined);
      },
    }),
  });
  return {
    db: {
      update: () => ({
        set: (s: Record<string, unknown>) => updateChain(s),
      }),
    },
  };
});

import { deliverOnce, __TEST } from './delivery';
import type { NoteCreatedPayload } from './types';

const target = {
  id: '00000000-0000-0000-0000-000000000001',
  url: 'https://hooks.example.com/strawberry',
  secret: 'whsec_testsecret',
};

const payload: NoteCreatedPayload = {
  event: 'note.created',
  timestamp: '2026-04-29T00:00:00.000Z',
  userId: 'user-1',
  note: {
    id: 'note-1',
    title: 'Hello',
    folderId: null,
    pinned: false,
    tagIds: [],
    updatedAt: '2026-04-29T00:00:00.000Z',
  },
};

const noSleep = () => Promise.resolve();

beforeEach(() => {
  updateCalls.length = 0;
});

describe('deliverOnce', () => {
  it('delivers successfully on a 2xx and marks success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const result = await deliverOnce(target, 'note.created', payload, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn: noSleep,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.attempt).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // The success update should clear consecutiveFailures and lastErrorMessage.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toMatchObject({ consecutiveFailures: 0, lastErrorMessage: null });
  });

  it('attaches the HMAC signature header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await deliverOnce(target, 'note.created', payload, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn: noSleep,
    });
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Strawberry-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers['X-Strawberry-Event']).toBe('note.created');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('retries on 5xx up to maxAttempts then marks failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    const result = await deliverOnce(target, 'note.created', payload, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn: noSleep,
      maxAttempts: 3,
    });
    expect(result.ok).toBe(false);
    expect(result.attempt).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set.lastErrorMessage).toBe('HTTP 503');
  });

  it('does NOT retry on 4xx but counts as a failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    const result = await deliverOnce(target, 'note.created', payload, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn: noSleep,
    });
    expect(result.ok).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.attempt).toBe(1);
    expect(updateCalls).toHaveLength(1);
  });

  it('retries on network error and surfaces the error message', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await deliverOnce(target, 'note.created', payload, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn: noSleep,
      maxAttempts: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('ECONNREFUSED');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('exposes a dead-letter threshold of 5', () => {
    expect(__TEST.DEAD_LETTER_AFTER).toBe(5);
  });
});
