/**
 * Unit tests for the embedding HTTP client. No network — we pass in a fake
 * fetch function. The goal is to pin the OpenAI-compatible request shape and
 * the error-handling path (missing config, dim mismatch, non-2xx responses).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  embedBatch,
  embedOne,
  embeddingInputFor,
  EmbeddingDimMismatchError,
  EmbeddingNotConfiguredError,
  isEmbeddingConfigured,
  readEmbeddingConfig,
} from './client';

const OLD = { ...process.env };

beforeEach(() => {
  // Clean slate so tests don't leak into each other.
  delete process.env.EMBEDDING_ENDPOINT;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_API_KEY;
  delete process.env.EMBEDDING_DIMS;
});

afterEach(() => {
  process.env = { ...OLD };
});

function okResponse(vectors: number[][]) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      data: vectors.map((embedding, index) => ({ embedding, index })),
    }),
    text: async () => '',
  } as unknown as Response;
}

describe('readEmbeddingConfig / isEmbeddingConfigured', () => {
  it('returns null when EMBEDDING_ENDPOINT is missing', () => {
    expect(readEmbeddingConfig()).toBeNull();
    expect(isEmbeddingConfigured()).toBe(false);
  });

  it('returns null when EMBEDDING_MODEL is missing', () => {
    process.env.EMBEDDING_ENDPOINT = 'https://api.openai.com/v1';
    expect(readEmbeddingConfig()).toBeNull();
    expect(isEmbeddingConfigured()).toBe(false);
  });

  it('returns a full config when both are set', () => {
    process.env.EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.EMBEDDING_API_KEY = 'sk-xxx';
    process.env.EMBEDDING_DIMS = '1536';
    const cfg = readEmbeddingConfig();
    // Trailing slash is trimmed so callers can safely append `/embeddings`.
    expect(cfg).toEqual({
      endpoint: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
      apiKey: 'sk-xxx',
      dims: 1536,
    });
    expect(isEmbeddingConfigured()).toBe(true);
  });

  it('defaults dims to 1024 when unset', () => {
    process.env.EMBEDDING_ENDPOINT = 'http://ollama:11434/v1';
    process.env.EMBEDDING_MODEL = 'nomic-embed-text';
    const cfg = readEmbeddingConfig();
    expect(cfg?.dims).toBe(1024);
    // No API key is fine (local providers often don't need one).
    expect(cfg?.apiKey).toBeNull();
  });
});

describe('embedBatch', () => {
  it('throws EmbeddingNotConfiguredError when env is empty', async () => {
    await expect(embedBatch(['hi'])).rejects.toBeInstanceOf(EmbeddingNotConfiguredError);
  });

  it('posts to <endpoint>/embeddings with the OpenAI request shape', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      okResponse([
        [1, 2, 3],
        [4, 5, 6],
      ]),
    );
    const vectors = await embedBatch(['hello', 'world'], {
      fetchFn,
      config: {
        endpoint: 'https://api.openai.com/v1',
        model: 'text-embedding-3-small',
        apiKey: 'sk-abc',
        dims: 3,
      },
    });
    expect(vectors).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ model: 'text-embedding-3-small', input: ['hello', 'world'] });
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer sk-abc');
  });

  it('omits Authorization when no api key is configured', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okResponse([[1, 2]]));
    await embedBatch(['x'], {
      fetchFn,
      config: {
        endpoint: 'http://ollama:11434/v1',
        model: 'nomic-embed-text',
        apiKey: null,
        dims: 2,
      },
    });
    const headers = fetchFn.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('throws EmbeddingDimMismatchError when provider returns the wrong dim', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okResponse([[1, 2, 3, 4]]));
    await expect(
      embedBatch(['x'], {
        fetchFn,
        config: {
          endpoint: 'https://api.openai.com/v1',
          model: 'text-embedding-3-small',
          apiKey: 'sk',
          dims: 3,
        },
      }),
    ).rejects.toBeInstanceOf(EmbeddingDimMismatchError);
  });

  it('propagates non-2xx responses with body context', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"error":"bad key"}',
      json: async () => ({}),
    } as unknown as Response);
    await expect(
      embedBatch(['x'], {
        fetchFn,
        config: {
          endpoint: 'https://api.openai.com/v1',
          model: 'm',
          apiKey: 'sk',
          dims: 2,
        },
      }),
    ).rejects.toThrow(/401.*bad key/);
  });

  it('sorts returned vectors by index defensively', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        data: [
          { embedding: [2, 2], index: 1 },
          { embedding: [1, 1], index: 0 },
        ],
      }),
      text: async () => '',
    } as unknown as Response);
    const vectors = await embedBatch(['a', 'b'], {
      fetchFn,
      config: {
        endpoint: 'https://api.openai.com/v1',
        model: 'm',
        apiKey: null,
        dims: 2,
      },
    });
    expect(vectors).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('embedOne', () => {
  it('unwraps a single-element batch', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okResponse([[9, 9]]));
    const v = await embedOne('solo', {
      fetchFn,
      config: {
        endpoint: 'https://api.openai.com/v1',
        model: 'm',
        apiKey: null,
        dims: 2,
      },
    });
    expect(v).toEqual([9, 9]);
  });
});

describe('embeddingInputFor', () => {
  it('prepends the title when present', () => {
    expect(embeddingInputFor('Hello', 'world body')).toBe('Hello\n\nworld body');
  });

  it('uses body alone when title is empty', () => {
    expect(embeddingInputFor('', 'just the body')).toBe('just the body');
  });

  it('truncates at the soft cap', () => {
    const big = 'x'.repeat(10_000);
    const out = embeddingInputFor('', big, 200);
    expect(out.length).toBe(200);
  });
});
