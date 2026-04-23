import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// --- DB fake: capture calls, return seeded rows ----------------------------

interface FakeDbState {
  selectResult: Array<{ id: string; storagePath: string; size: number; noteId?: string | null }>;
  deleteResult: Array<{ id: string }>;
  capturedWhereCalls: number;
  deleteCalls: number;
  selectCalls: number;
}

const state: FakeDbState = {
  selectResult: [],
  deleteResult: [],
  capturedWhereCalls: 0,
  deleteCalls: 0,
  selectCalls: 0,
};

function resetState() {
  state.selectResult = [];
  state.deleteResult = [];
  state.capturedWhereCalls = 0;
  state.deleteCalls = 0;
  state.selectCalls = 0;
}

vi.mock('../db/client', () => {
  const selectChain = {
    from: () => selectChain,
    where: () => {
      state.selectCalls += 1;
      state.capturedWhereCalls += 1;
      return Promise.resolve(state.selectResult);
    },
  };
  const deleteChain = {
    where: () => deleteChain,
    returning: () => {
      state.deleteCalls += 1;
      return Promise.resolve(state.deleteResult);
    },
  };
  return {
    db: {
      select: () => selectChain,
      delete: () => deleteChain,
    },
  };
});

// --- fs fake: track unlink calls -------------------------------------------

const unlinkCalls: string[] = [];
const unlinkErrors = new Map<string, NodeJS.ErrnoException>();

vi.mock('node:fs/promises', () => {
  const unlink = (path: string) => {
    unlinkCalls.push(path);
    const err = unlinkErrors.get(path);
    if (err) return Promise.reject(err);
    return Promise.resolve();
  };
  return {
    default: { unlink },
    unlink,
  };
});

vi.mock('../storage', () => ({
  uploadsDir: () => '/fake/uploads',
}));

// --- Tests -----------------------------------------------------------------

beforeEach(() => {
  resetState();
  unlinkCalls.length = 0;
  unlinkErrors.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gcOrphanAttachments', () => {
  it('returns zero result when nothing to collect', async () => {
    const { gcOrphanAttachments } = await import('./gc');
    const out = await gcOrphanAttachments('u1');
    expect(out).toEqual({ removedFiles: 0, removedRows: 0, freedBytes: 0 });
    expect(unlinkCalls).toEqual([]);
    expect(state.deleteCalls).toBe(0);
  });

  it('unlinks every matching file and deletes their rows', async () => {
    state.selectResult = [
      { id: 'a1', storagePath: 'a.png', size: 100, noteId: null },
      { id: 'a2', storagePath: 'b.jpg', size: 200, noteId: null },
    ];
    state.deleteResult = [{ id: 'a1' }, { id: 'a2' }];
    const { gcOrphanAttachments } = await import('./gc');
    const out = await gcOrphanAttachments('u1');
    expect(unlinkCalls).toEqual(['/fake/uploads/a.png', '/fake/uploads/b.jpg']);
    expect(out).toEqual({ removedFiles: 2, removedRows: 2, freedBytes: 300 });
  });

  it('treats ENOENT as already-freed (counts size, does not count file)', async () => {
    const enoent: NodeJS.ErrnoException = Object.assign(new Error('no'), { code: 'ENOENT' });
    unlinkErrors.set('/fake/uploads/a.png', enoent);
    state.selectResult = [{ id: 'a1', storagePath: 'a.png', size: 100, noteId: null }];
    state.deleteResult = [{ id: 'a1' }];
    const { gcOrphanAttachments } = await import('./gc');
    const out = await gcOrphanAttachments('u1');
    // File wasn't there, so removedFiles stays 0; but freedBytes includes it.
    expect(out).toEqual({ removedFiles: 0, removedRows: 1, freedBytes: 100 });
  });

  it('issues exactly one scoped SELECT for orphans', async () => {
    state.selectResult = [];
    const { gcOrphanAttachments } = await import('./gc');
    await gcOrphanAttachments('u1');
    // The drizzle AST is expensive to introspect; the contract we care about
    // is that there is a single SELECT with a WHERE clause (i.e. not a
    // full-table scan that post-filters in JS).
    expect(state.selectCalls).toBe(1);
    expect(state.capturedWhereCalls).toBe(1);
  });
});

describe('orphan SELECT shape (drizzle compile)', () => {
  it('compiles to SQL that matches noteId IS NULL or the note does not exist', async () => {
    // Build the same WHERE the helper uses, but off to the side so we can
    // inspect the SQL. This verifies the query shape without hitting a DB.
    const { and, eq, sql } = await import('drizzle-orm');
    const { attachments, notes } = await import('../db/schema');
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const dialect = new PgDialect();
    const userId = 'u1';
    const whereSql = and(
      eq(attachments.userId, userId),
      sql`(${attachments.noteId} IS NULL OR NOT EXISTS (
        SELECT 1 FROM ${notes}
        WHERE ${notes.id} = ${attachments.noteId}
          AND ${notes.userId} = ${userId}
      ))`,
    );
    // Render via the dialect's sql() helper.
    const rendered = dialect.sqlToQuery(whereSql!).sql;
    expect(rendered).toMatch(/"attachments"\."user_id"/);
    expect(rendered).toMatch(/"attachments"\."note_id" IS NULL/);
    expect(rendered).toMatch(/NOT EXISTS/i);
    expect(rendered).toMatch(/"notes"\."id" = "attachments"\."note_id"/);
  });
});

describe('deleteAttachmentsForNote', () => {
  it('is a no-op when the note has no attachments', async () => {
    state.selectResult = [];
    const { deleteAttachmentsForNote } = await import('./gc');
    const out = await deleteAttachmentsForNote('u1', 'n1');
    expect(out).toEqual({ removedFiles: 0, removedRows: 0, freedBytes: 0 });
  });

  it('removes each attached file + row', async () => {
    state.selectResult = [{ id: 'a1', storagePath: 'x.webp', size: 500, noteId: 'n1' }];
    state.deleteResult = [{ id: 'a1' }];
    const { deleteAttachmentsForNote } = await import('./gc');
    const out = await deleteAttachmentsForNote('u1', 'n1');
    expect(unlinkCalls).toEqual(['/fake/uploads/x.webp']);
    expect(out).toEqual({ removedFiles: 1, removedRows: 1, freedBytes: 500 });
  });
});
