/**
 * Worker-logic tests. We stub `lib/db/client` so no real DB is needed, and we
 * drive `runOnce` directly rather than going through the timer-based
 * `kickEmbeddingWorker` (timers are tested separately / implicitly).
 *
 * The key behavioural guarantees we want to pin:
 *   1. No DB calls when the provider is not configured.
 *   2. When rows come back, they are passed through `embedBatch`, and the
 *      resulting vectors are written back with `embedding_stale = false`.
 *   3. When no rows come back, we exit cleanly (returns 0).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();

vi.mock('../db/client', () => ({
  db: { execute: (...args: unknown[]) => executeMock(...args) },
}));

// Stub the embedding HTTP call so we don't need the network.
const embedBatchMock = vi.fn();
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    embedBatch: (...args: unknown[]) => embedBatchMock(...args),
  };
});

import {
  errorBackoffMs,
  getEmbeddingWorkerStatus,
  kickEmbeddingWorker,
  runOnce,
  __resetWorkerForTests,
} from './worker';
import { __setEmbeddingAvailableForTests } from './availability';

beforeEach(() => {
  executeMock.mockReset();
  embedBatchMock.mockReset();
  __resetWorkerForTests();
  process.env.EMBEDDING_ENDPOINT = 'https://api.example/v1';
  process.env.EMBEDDING_MODEL = 'm';
  process.env.EMBEDDING_DIMS = '3';
  delete process.env.EMBEDDING_API_KEY;
  // Default: pgvector's column exists, matching every pre-existing test's
  // assumptions. The dedicated "pgvector not available" test below flips it.
  __setEmbeddingAvailableForTests(true);
});

afterEach(() => {
  delete process.env.EMBEDDING_ENDPOINT;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_DIMS;
});

describe('runOnce', () => {
  it('is a no-op when the provider env is unset', async () => {
    delete process.env.EMBEDDING_ENDPOINT;
    const processed = await runOnce();
    expect(processed).toBe(0);
    expect(executeMock).not.toHaveBeenCalled();
    expect(embedBatchMock).not.toHaveBeenCalled();
  });

  it('returns 0 and issues no updates when no stale rows exist', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const processed = await runOnce();
    expect(processed).toBe(0);
    // One SELECT, no UPDATEs.
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(embedBatchMock).not.toHaveBeenCalled();
  });

  it('embeds a batch and writes vectors back, clearing the stale flag', async () => {
    // 1st call = SELECT, returning two rows.
    executeMock.mockResolvedValueOnce({
      rows: [
        { id: 'id-a', title: 'A', content_text: 'alpha body' },
        { id: 'id-b', title: 'B', content_text: 'beta body' },
      ],
    });
    // UPDATEs return empty results (we don't read them).
    executeMock.mockResolvedValue({ rows: [] });

    embedBatchMock.mockResolvedValueOnce([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);

    const processed = await runOnce({ batchSize: 8 });
    expect(processed).toBe(2);

    // The embedding call got the combined title+body strings, in batch form.
    const [inputs] = embedBatchMock.mock.calls[0];
    expect(inputs).toEqual(['A\n\nalpha body', 'B\n\nbeta body']);

    // 1 SELECT + 2 UPDATEs = 3 calls.
    expect(executeMock).toHaveBeenCalledTimes(3);
  });

  it('stays idle when pgvector is not available, even with the provider configured', async () => {
    __setEmbeddingAvailableForTests(false);
    const processed = await runOnce();
    expect(processed).toBe(0);
    expect(executeMock).not.toHaveBeenCalled();
    expect(embedBatchMock).not.toHaveBeenCalled();
  });

  it('refuses to double-run while a batch is in flight', async () => {
    // First call: SELECT resolves after the second runOnce is already invoked.
    let resolveSelect: (v: unknown) => void = () => {};
    const pending = new Promise((r) => {
      resolveSelect = r;
    });
    executeMock.mockReturnValueOnce(pending);

    const first = runOnce();
    // Second call while the first is still pending — should short-circuit.
    const second = await runOnce();
    expect(second).toBe(0);

    // Let the first one finish.
    resolveSelect({ rows: [] });
    await first;
  });
});

describe('failure handling', () => {
  const rows = [
    { id: 'id-a', title: 'A', content_text: 'alpha' },
    { id: 'id-b', title: 'B', content_text: 'bad' },
    { id: 'id-c', title: 'C', content_text: 'gamma' },
  ];

  it('retries a failed batch row by row so one bad row does not block the rest', async () => {
    executeMock.mockResolvedValueOnce({ rows });
    executeMock.mockResolvedValue({ rows: [] });
    embedBatchMock.mockImplementation(async (inputs: string[]) => {
      if (inputs.length > 1) throw new Error('batch rejected');
      if (inputs[0].includes('bad')) throw new Error('input rejected');
      return [[0.1, 0.2, 0.3]];
    });

    const processed = await runOnce();
    expect(processed).toBe(2);
    // 1 batch call + 3 single-row retries.
    expect(embedBatchMock).toHaveBeenCalledTimes(4);
    // 1 SELECT + 2 UPDATEs (the bad row stays stale).
    expect(executeMock).toHaveBeenCalledTimes(3);
    expect(getEmbeddingWorkerStatus().lastError).toBe('input rejected');
  });

  it('throws when no row in the batch could be embedded', async () => {
    executeMock.mockResolvedValueOnce({ rows });
    embedBatchMock.mockRejectedValue(new Error('provider down'));
    await expect(runOnce()).rejects.toThrow('provider down');
    // Only the SELECT ran — nothing was written.
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('backs off with doubling delays capped at 15 minutes', () => {
    expect(errorBackoffMs(1)).toBe(30_000);
    expect(errorBackoffMs(2)).toBe(60_000);
    expect(errorBackoffMs(3)).toBe(120_000);
    expect(errorBackoffMs(6)).toBe(15 * 60_000);
    expect(errorBackoffMs(50)).toBe(15 * 60_000);
  });

  it('reschedules after an error and resets the backoff on the next clean run', async () => {
    vi.useFakeTimers();
    try {
      // Run 1: provider down.
      executeMock.mockResolvedValueOnce({ rows: rows.slice(0, 1) });
      embedBatchMock.mockRejectedValueOnce(new Error('provider down'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      kickEmbeddingWorker(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(getEmbeddingWorkerStatus()).toMatchObject({
        consecutiveFailures: 1,
        lastError: 'provider down',
      });

      // A write-triggered kick during the backoff coalesces — no new run.
      kickEmbeddingWorker(0);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(embedBatchMock).toHaveBeenCalledTimes(1);

      // Run 2 fires after the 30 s backoff and succeeds.
      executeMock.mockResolvedValueOnce({ rows: rows.slice(0, 1) });
      executeMock.mockResolvedValue({ rows: [] });
      embedBatchMock.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(embedBatchMock).toHaveBeenCalledTimes(2);
      expect(getEmbeddingWorkerStatus().consecutiveFailures).toBe(0);
      expect(getEmbeddingWorkerStatus().lastSuccessAt).not.toBeNull();
      errSpy.mockRestore();
    } finally {
      __resetWorkerForTests();
      vi.useRealTimers();
    }
  });
});
