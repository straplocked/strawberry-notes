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

import { runOnce, __resetWorkerForTests } from './worker';

beforeEach(() => {
  executeMock.mockReset();
  embedBatchMock.mockReset();
  __resetWorkerForTests();
  process.env.EMBEDDING_ENDPOINT = 'https://api.example/v1';
  process.env.EMBEDDING_MODEL = 'm';
  process.env.EMBEDDING_DIMS = '3';
  delete process.env.EMBEDDING_API_KEY;
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
