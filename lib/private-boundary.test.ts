/**
 * Cross-cutting proof for Vikunja 710 ("04 · Agent trust boundary", PR A):
 * the Private Notes claim in docs/technical/private-notes.md — "never
 * embedded", "not found" for MCP writes, tokens can't act as a disabled
 * user — actually holds, not just documented.
 *
 * Each guarantee also has (or now has) a narrower unit test living next to
 * its own code:
 *   - MCP write tools (`update_note` / `delete_note` / `add_tag` /
 *     `remove_tag`) refusing a private note id: lib/mcp/server.test.ts,
 *     describe block "write tools refuse a private note id (task 04 PR A)".
 *   - A disabled user's bearer token being rejected: lib/auth/token.test.ts,
 *     describe block "disabled-user rejection (task 04 PR A)".
 *
 * This file covers the third guarantee end-to-end — "a locked note has no
 * embedding" — at both of the places that matter: the write path
 * (`updateNote`'s plaintext→private transition must null `contentEmbedding`
 * immediately) and the read/re-embed path (the embedding worker's own
 * per-row UPDATE must re-check eligibility, not trust a stale SELECT).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Shared `db` mock. Two call shapes are exercised in this file:
//   - `updateNote`'s own UPDATE + its trailing `getNote` SELECT.
//   - the embedding worker's raw `db.execute(sql\`...\`)` calls.
// ---------------------------------------------------------------------------

const state = {
  updateSetCalls: [] as Array<Record<string, unknown>>,
  executeCalls: [] as unknown[],
  executeResults: [] as unknown[],
};

vi.mock('./db/client', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updateSetCalls.push(values);
        return {
          where: () => ({
            returning: async () => [
              { id: 'note-1', title: 'Hello', encryption: values.encryption ?? null },
            ],
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            groupBy: () =>
              Promise.resolve([
                {
                  id: 'note-1',
                  folderId: null,
                  title: 'Hello',
                  content: 'ZmFrZS1jaXBoZXJ0ZXh0',
                  contentText: '',
                  pinned: false,
                  trashedAt: null,
                  createdAt: new Date('2026-05-02T00:00:00Z'),
                  updatedAt: new Date('2026-05-02T00:00:00Z'),
                  encryption: { v: 1, iv: 'abcdefabcdefabcdefab' },
                  tagIds: [],
                },
              ]),
          }),
        }),
      }),
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    execute: (arg: unknown) => {
      state.executeCalls.push(arg);
      const next = state.executeResults.shift();
      return Promise.resolve(next ?? { rows: [] });
    },
  },
}));

vi.mock('./notes/tag-resolution', () => ({
  upsertTagsByName: vi.fn(async () => []),
  setNoteTags: vi.fn(async () => {}),
}));

vi.mock('./notes/link-service', () => ({
  resolvePendingLinksForTitle: vi.fn(async () => []),
  syncOutboundLinks: vi.fn(async () => []),
  unresolveLinksTo: vi.fn(async () => {}),
  listBacklinks: vi.fn(async () => []),
}));

vi.mock('./notes/gc', () => ({
  deleteAttachmentsForNote: vi.fn(async () => {}),
}));

vi.mock('./webhooks/fire', () => ({
  fireNoteCreated: vi.fn(),
  fireNoteLinked: vi.fn(),
  fireNoteTagged: vi.fn(),
  fireNoteTrashed: vi.fn(),
  fireNoteUpdated: vi.fn(),
  noteRef: vi.fn((dto: { id: string }) => ({ id: dto.id })),
}));

// `updateNote` imports `kickEmbeddingWorker` from this module. The
// plaintext→private path never calls it (embeddingStale is forced false on
// lock), but the import must still resolve.
vi.mock('./embeddings/worker', async () => {
  const actual = await vi.importActual<typeof import('./embeddings/worker')>('./embeddings/worker');
  return { ...actual, kickEmbeddingWorker: vi.fn() };
});

const embedBatchMock = vi.fn();
vi.mock('./embeddings/client', async () => {
  const actual = await vi.importActual<typeof import('./embeddings/client')>('./embeddings/client');
  return {
    ...actual,
    embedBatch: (...args: unknown[]) => embedBatchMock(...args),
  };
});

import { updateNote } from './notes/service';
import { runOnce, __resetWorkerForTests } from './embeddings/worker';
import { __setEmbeddingAvailableForTests } from './embeddings/availability';

beforeEach(() => {
  state.updateSetCalls.length = 0;
  state.executeCalls.length = 0;
  state.executeResults.length = 0;
  embedBatchMock.mockReset();
  __resetWorkerForTests();
  __setEmbeddingAvailableForTests(true);
});

describe('locking a note nulls its embedding', () => {
  it('updateNote clears contentEmbedding on the plaintext→private transition', async () => {
    const dto = await updateNote('user-1', 'note-1', {
      encryption: { v: 1, iv: 'abcdefabcdefabcdefab' },
      ciphertext: 'ZmFrZS1jaXBoZXJ0ZXh0',
    });

    expect(dto).not.toBeNull();
    expect(state.updateSetCalls).toHaveLength(1);
    const updates = state.updateSetCalls[0];
    // The crux of the migration-0014 fix: without this, a note that had
    // already been embedded as plaintext would keep its last-computed
    // vector after being locked — reachable by search_semantic even though
    // the body itself became ciphertext. docs/technical/private-notes.md
    // claims `contentEmbedding | NULL (never embedded)`; this is what makes
    // it true at the instant a note goes private, not just going forward.
    expect(updates).toMatchObject({
      contentEmbedding: null,
      contentText: '',
      snippet: '',
      hasImage: false,
      embeddingStale: false,
    });
  });

  it("the embedding worker's per-row UPDATE still requires eligibility, not just the earlier SELECT", async () => {
    process.env.EMBEDDING_ENDPOINT = 'https://api.example/v1';
    process.env.EMBEDDING_MODEL = 'm';
    process.env.EMBEDDING_DIMS = '3';

    // 1st execute() = the batch SELECT; return one stale row.
    state.executeResults.push({
      rows: [{ id: 'note-1', title: 'A', content_text: 'alpha body' }],
    });
    // 2nd execute() = the per-row UPDATE; return value is unused by runOnce.
    state.executeResults.push({ rows: [] });
    embedBatchMock.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

    const processed = await runOnce({ batchSize: 8 });
    expect(processed).toBe(1);
    expect(state.executeCalls).toHaveLength(2);

    // Compile the captured UPDATE's SQL object the same way drizzle would,
    // and assert the eligibility fragment survived the interpolation. This
    // is the regression this test exists to catch: it would have passed
    // before this task's fix (the UPDATE only filtered on `id`), and fails
    // now if `lib/embeddings/eligible.ts`'s fragment is ever dropped from
    // the worker's UPDATE again.
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(state.executeCalls[1] as SQL).sql;
    expect(rendered.toLowerCase()).toMatch(/update\s+notes/);
    expect(rendered.toLowerCase()).toContain('encryption is null');
    expect(rendered.toLowerCase()).toContain('trashed_at is null');

    delete process.env.EMBEDDING_ENDPOINT;
    delete process.env.EMBEDDING_MODEL;
    delete process.env.EMBEDDING_DIMS;
  });
});

afterEach(() => {
  delete process.env.EMBEDDING_ENDPOINT;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_DIMS;
});
