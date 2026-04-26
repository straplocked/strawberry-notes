import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SelectStub {
  result: Array<{ id: string }>;
}

const selectStubs: SelectStub[] = [];
const inserts: Array<{ values: Record<string, unknown> }> = [];
const insertReturning: Array<Array<{ id: string }>> = [];

function reset() {
  selectStubs.length = 0;
  inserts.length = 0;
  insertReturning.length = 0;
}

vi.mock('../db/client', () => {
  const select = () => {
    const stub = selectStubs.shift() ?? { result: [] };
    return {
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(stub.result),
        }),
      }),
    };
  };
  // We don't infer the target table from drizzle's table ref; the tests
  // assert on the recorded `values` shape (e.g. `name: 'Daily'` for the
  // folder insert vs. `title: 'Daily — …'` for the note insert).
  const insert = () => ({
    values: (vals: Record<string, unknown>) => {
      inserts.push({ values: vals });
      const ret = insertReturning.shift() ?? [{ id: `inserted-${inserts.length}` }];
      return {
        returning: () => Promise.resolve(ret),
      };
    },
  });
  return { db: { select, insert } };
});

vi.mock('./service', () => ({
  getNote: vi.fn(async (_userId: string, id: string) => ({
    id,
    folderId: 'folder-id',
    title: 'whatever',
    content: { type: 'doc', content: [] },
    contentText: '',
    pinned: false,
    tagIds: [],
    trashedAt: null,
    updatedAt: '2026-04-26T00:00:00Z',
    createdAt: '2026-04-26T00:00:00Z',
  })),
}));

vi.mock('../embeddings/worker', () => ({
  kickEmbeddingWorker: vi.fn(),
}));

import { dailyTitleFor, openOrCreateDailyNote } from './daily';
import { kickEmbeddingWorker } from '../embeddings/worker';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dailyTitleFor', () => {
  it('formats the local date as `Daily — YYYY-MM-DD`', () => {
    const d = new Date(2026, 3, 26, 14, 30, 0); // 2026-04-26 (April is month=3)
    expect(dailyTitleFor(d)).toBe('Daily — 2026-04-26');
  });

  it('zero-pads single-digit month + day', () => {
    const d = new Date(2026, 0, 5, 0, 0, 0); // 2026-01-05
    expect(dailyTitleFor(d)).toBe('Daily — 2026-01-05');
  });
});

describe('openOrCreateDailyNote', () => {
  it('returns the existing note when one is already present and creates nothing', async () => {
    selectStubs.push({ result: [{ id: 'existing-note-id' }] });
    const out = await openOrCreateDailyNote('u-1', new Date(2026, 3, 26));
    expect(out.created).toBe(false);
    expect(out.note.id).toBe('existing-note-id');
    expect(inserts).toHaveLength(0);
    expect(kickEmbeddingWorker).not.toHaveBeenCalled();
  });

  it('reuses an existing Daily folder and creates the note', async () => {
    selectStubs.push({ result: [] });                // no existing daily note
    selectStubs.push({ result: [{ id: 'folder-1' }] }); // Daily folder exists
    insertReturning.push([{ id: 'note-1' }]);
    const out = await openOrCreateDailyNote('u-1', new Date(2026, 3, 26));
    expect(out.created).toBe(true);
    // One insert: the note. The folder lookup short-circuits.
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      userId: 'u-1',
      title: 'Daily — 2026-04-26',
      folderId: 'folder-1',
      embeddingStale: true,
    });
    expect(kickEmbeddingWorker).toHaveBeenCalledTimes(1);
  });

  it('creates the Daily folder when it does not exist, then the note', async () => {
    selectStubs.push({ result: [] }); // no existing daily note
    selectStubs.push({ result: [] }); // no Daily folder
    insertReturning.push([{ id: 'folder-new' }]); // folder insert
    insertReturning.push([{ id: 'note-new' }]);   // note insert
    const out = await openOrCreateDailyNote('u-2', new Date(2026, 0, 5));
    expect(out.created).toBe(true);
    // Two inserts: folder + note.
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values).toMatchObject({
      userId: 'u-2',
      name: 'Daily',
      color: '#5fae6a',
    });
    expect(inserts[1].values).toMatchObject({
      userId: 'u-2',
      folderId: 'folder-new',
      title: 'Daily — 2026-01-05',
    });
  });
});
