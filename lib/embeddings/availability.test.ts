/**
 * Tests for the pgvector runtime-availability check. We stub `lib/db/client`
 * so no real DB is needed and pin the three behaviours that matter:
 *   1. Column present → available, and the DB is queried only once (cached).
 *   2. Column absent → unavailable, and the "disabled" line is logged once.
 *   3. A DB error is treated as "unavailable" rather than thrown.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();

vi.mock('../db/client', () => ({
  db: { execute: (...args: unknown[]) => executeMock(...args) },
}));

import {
  isEmbeddingColumnAvailable,
  __resetEmbeddingAvailabilityForTests,
  __setEmbeddingAvailableForTests,
} from './availability';

beforeEach(() => {
  executeMock.mockReset();
  __resetEmbeddingAvailabilityForTests();
});

afterEach(() => {
  __resetEmbeddingAvailabilityForTests();
});

describe('isEmbeddingColumnAvailable', () => {
  it('returns true and caches when the column exists', async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    expect(await isEmbeddingColumnAvailable()).toBe(true);
    expect(await isEmbeddingColumnAvailable()).toBe(true);
    // Cached after the first check — only one DB round trip.
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('returns false and logs once when the column is missing', async () => {
    executeMock.mockResolvedValue({ rows: [] });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(await isEmbeddingColumnAvailable()).toBe(false);
    expect(await isEmbeddingColumnAvailable()).toBe(false);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('pgvector not available: semantic search disabled'),
    );

    infoSpy.mockRestore();
  });

  it('treats a DB error as unavailable instead of throwing', async () => {
    executeMock.mockRejectedValueOnce(new Error('connection refused'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(isEmbeddingColumnAvailable()).resolves.toBe(false);

    errorSpy.mockRestore();
  });

  it('test helper forces a value without touching the DB', async () => {
    __setEmbeddingAvailableForTests(true);
    expect(await isEmbeddingColumnAvailable()).toBe(true);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
