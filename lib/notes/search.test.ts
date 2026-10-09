/**
 * Hybrid search (Vikunja 712, task 06). The DB is mocked, so these tests pin
 * the generated SQL's shape (RRF fusion, the eligibility fragment, filters)
 * and the query-vector policy (threshold, cache, rate limit, timeout, silent
 * fallback) rather than real ranking — that is proven on the main checkout
 * with scripts/eval-search.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const executeMock = vi.fn();
vi.mock('../db/client', () => ({
  db: { execute: (arg: unknown) => executeMock(arg) },
}));

import { __setEmbeddingAvailableForTests } from '../embeddings/availability';
import { __resetEmbeddingClientForTests } from '../embeddings/client';
import { listNotes } from './service';
import { __resetSearchCacheForTests, escapeLike, searchNotes } from './search';

const dialect = new PgDialect();
function lastQuery(): { sql: string; params: unknown[] } {
  const arg = executeMock.mock.calls.at(-1)?.[0] as SQL;
  return dialect.sqlToQuery(arg);
}

function okEmbedding(vec: number[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ data: [{ embedding: vec, index: 0 }] }),
    text: async () => '',
  } as unknown as Response;
}

let userSeq = 0;
/** Fresh user per test so the per-user rate limiter never carries over. */
function nextUser() {
  userSeq += 1;
  return `user-${userSeq}`;
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    folderId: null,
    title: 'Sourdough starter',
    snippet: 'feed it daily',
    contentText: 'feed it daily',
    hasImage: false,
    pinned: false,
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    isPrivate: false,
    tagIds: ['t1'],
    byText: true,
    byMeaning: false,
    ...over,
  };
}

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockResolvedValue({ rows: [] });
  __resetSearchCacheForTests();
  __resetEmbeddingClientForTests();
  __setEmbeddingAvailableForTests(true);
  delete process.env.EMBEDDING_ENDPOINT;
  delete process.env.EMBEDDING_MODEL;
  process.env.EMBEDDING_DIMS = '3';
});

afterEach(() => {
  delete process.env.EMBEDDING_ENDPOINT;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_DIMS;
  vi.restoreAllMocks();
});

function configureEmbeddings() {
  process.env.EMBEDDING_ENDPOINT = 'http://ollama:11434/v1';
  process.env.EMBEDDING_MODEL = 'qwen3-embedding:0.6b';
}

describe('searchNotes without embeddings', () => {
  it('ranks by text relevance with a title boost, not by updatedAt', async () => {
    await searchNotes(nextUser(), { q: 'starter' });
    const { sql } = lastQuery();
    expect(sql).toContain('ts_rank_cd(content_tsv');
    expect(sql).toContain('ILIKE');
    expect(sql).toMatch(/ORDER BY fused\.score DESC/);
    // No vector half at all.
    expect(sql).not.toContain('<=>');
    expect(sql).toContain('WHERE false');
  });

  it('keeps the 500-row cap so every keyword hit up to 500 still appears', async () => {
    await searchNotes(nextUser(), { q: 'starter' });
    const { params } = lastQuery();
    expect(params).toContain(500);
  });

  it('maps rows, preserves server order and tags each with matchedBy', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        row({ id: 'a', byText: true, byMeaning: true }),
        row({ id: 'b', byText: false, byMeaning: true }),
        row({ id: 'c' }),
        row({ id: 'd', isPrivate: true, snippet: '', contentText: '' }),
      ],
    });
    const out = await searchNotes(nextUser(), { q: 'starter' });
    expect(out.map((r) => [r.id, r.matchedBy])).toEqual([
      ['a', 'both'],
      ['b', 'meaning'],
      ['c', 'text'],
      ['d', 'text'],
    ]);
    expect(out[0]).toMatchObject({
      title: 'Sourdough starter',
      snippet: 'feed it daily',
      updatedAt: '2026-10-01T00:00:00.000Z',
      tagIds: ['t1'],
      private: false,
    });
    expect(out[3]).toMatchObject({ private: true, snippet: '' });
  });

  it('escapes LIKE metacharacters in the title match', async () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    await searchNotes(nextUser(), { q: '50%' });
    expect(lastQuery().params).toContain('%50\\%%');
  });

  it('honours the shared list filters (folder, trash, bearer private exclusion)', async () => {
    await searchNotes(nextUser(), { q: 'x', folder: 'trash' }, { includePrivate: false });
    const { sql } = lastQuery();
    expect(sql).toContain('"notes"."trashed_at" is not null');
    expect(sql).toContain('"notes"."encryption" is null');
  });

  it('is what listNotes delegates to when q is set', async () => {
    await listNotes(nextUser(), { q: '  starter  ' });
    const { sql, params } = lastQuery();
    expect(sql).toContain('WITH text_hits AS');
    expect(params).toContain('starter');
  });
});

describe('searchNotes with embeddings configured', () => {
  it('fuses a vector CTE limited to AI-eligible notes with RRF k=60', async () => {
    configureEmbeddings();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okEmbedding([0.1, 0.2, 0.3]));
    await searchNotes(nextUser(), { q: 'bread fermentation' }, { fetchFn });

    expect(fetchFn).toHaveBeenCalledOnce();
    const { sql, params } = lastQuery();
    expect(sql).toContain('content_embedding <=>');
    expect(sql).toContain('encryption IS NULL AND trashed_at IS NULL');
    expect(sql).toContain('FULL OUTER JOIN vector_hits');
    expect(params).toContain('[0.1,0.2,0.3]');
    expect(params).toContain(60);
    expect(params).toContain(10);
  });

  it('applies the eligibility fragment for session and bearer callers alike', async () => {
    configureEmbeddings();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okEmbedding([1, 0, 0]));
    for (const includePrivate of [true, false]) {
      await searchNotes(nextUser(), { q: 'bread' }, { fetchFn, includePrivate });
      const vectorCte = lastQuery().sql.split('vector_hits AS')[1].split('fused AS')[0];
      expect(vectorCte).toContain('encryption IS NULL AND trashed_at IS NULL');
    }
  });

  it('skips the embedding call for queries under 3 characters', async () => {
    configureEmbeddings();
    const fetchFn = vi.fn<typeof fetch>();
    await searchNotes(nextUser(), { q: 'ab' }, { fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(lastQuery().sql).not.toContain('<=>');
  });

  it('caches query vectors per model + query', async () => {
    configureEmbeddings();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okEmbedding([1, 0, 0]));
    const user = nextUser();
    await searchNotes(user, { q: 'homelab vlan' }, { fetchFn });
    await searchNotes(user, { q: 'homelab vlan' }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(lastQuery().sql).toContain('<=>');
  });

  it('falls back to text-only with no error when the provider fails', async () => {
    configureEmbeddings();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'boom',
      text: async () => '',
      json: async () => ({}),
    } as unknown as Response);
    await expect(searchNotes(nextUser(), { q: 'bread' }, { fetchFn })).resolves.toEqual([]);
    expect(lastQuery().sql).not.toContain('<=>');
  });

  it('falls back to text-only when the provider is slower than 1.5 s', async () => {
    configureEmbeddings();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const started = Date.now();
    await searchNotes(nextUser(), { q: 'bread' }, { fetchFn });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(lastQuery().sql).not.toContain('<=>');
  });

  it('falls back to text-only once the per-user rate limit is spent', async () => {
    configureEmbeddings();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okEmbedding([1, 0, 0]));
    const user = nextUser();
    for (let i = 0; i < 15; i += 1) {
      await searchNotes(user, { q: `distinct query ${i}` }, { fetchFn });
    }
    expect(fetchFn.mock.calls.length).toBeLessThan(15);
    expect(lastQuery().sql).not.toContain('<=>');
  });

  it('skips the vector half when the pgvector column is unavailable', async () => {
    configureEmbeddings();
    __setEmbeddingAvailableForTests(false);
    const fetchFn = vi.fn<typeof fetch>();
    await searchNotes(nextUser(), { q: 'bread' }, { fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
