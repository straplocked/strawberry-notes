/**
 * `register()` runs once at server boot. We only need to pin two things:
 * it warms the pgvector-availability cache in the Node.js runtime, and it's
 * a no-op everywhere else (edge runtime), where there's no Postgres pool to
 * even check.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) {
    delete process.env.NEXT_RUNTIME;
  } else {
    process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME;
  }
  vi.doUnmock('./lib/embeddings/availability');
  vi.doUnmock('./lib/embeddings/worker');
});

describe('register', () => {
  it('warms the pgvector availability cache in the nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const isEmbeddingColumnAvailable = vi.fn().mockResolvedValue(true);
    vi.doMock('./lib/embeddings/availability', () => ({ isEmbeddingColumnAvailable }));

    const { register } = await import('./instrumentation');
    await register();

    expect(isEmbeddingColumnAvailable).toHaveBeenCalledTimes(1);
  });

  it('kicks the embedding worker once at boot when pgvector is available', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    vi.doMock('./lib/embeddings/availability', () => ({
      isEmbeddingColumnAvailable: vi.fn().mockResolvedValue(true),
    }));
    const kickEmbeddingWorker = vi.fn();
    vi.doMock('./lib/embeddings/worker', () => ({ kickEmbeddingWorker }));

    const { register } = await import('./instrumentation');
    await register();

    expect(kickEmbeddingWorker).toHaveBeenCalledTimes(1);
  });

  it('does not kick the worker when pgvector is unavailable', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    vi.doMock('./lib/embeddings/availability', () => ({
      isEmbeddingColumnAvailable: vi.fn().mockResolvedValue(false),
    }));
    const kickEmbeddingWorker = vi.fn();
    vi.doMock('./lib/embeddings/worker', () => ({ kickEmbeddingWorker }));

    const { register } = await import('./instrumentation');
    await register();

    expect(kickEmbeddingWorker).not.toHaveBeenCalled();
  });

  it('is a no-op outside the nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    const isEmbeddingColumnAvailable = vi.fn();
    vi.doMock('./lib/embeddings/availability', () => ({ isEmbeddingColumnAvailable }));

    const { register } = await import('./instrumentation');
    await register();

    expect(isEmbeddingColumnAvailable).not.toHaveBeenCalled();
  });

  it('does not throw when the availability check itself fails', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const isEmbeddingColumnAvailable = vi.fn().mockRejectedValue(new Error('db unreachable'));
    vi.doMock('./lib/embeddings/availability', () => ({ isEmbeddingColumnAvailable }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { register } = await import('./instrumentation');
    await expect(register()).resolves.toBeUndefined();

    errorSpy.mockRestore();
  });
});
