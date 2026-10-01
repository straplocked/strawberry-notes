/**
 * Task 04 PR B: a read-scoped bearer token must not be able to import notes
 * (the only REST write route bearer tokens can currently reach — see
 * docs/technical/mcp.md "Security Notes" and lib/auth/require-api.ts).
 * Session auth and write-scoped tokens are unaffected.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  auth: { ok: true, userId: 'user-1', via: 'bearer', scope: 'write' } as
    | { ok: true; userId: string; via: 'bearer' | 'session'; scope: 'read' | 'write' }
    | { ok: false; response: Response },
  insertedNotes: [] as Array<Record<string, unknown>>,
  folderRows: [{ id: 'folder-1' }] as Array<{ id: string }>,
};

vi.mock('@/lib/auth/require-api', () => ({
  requireUserIdForApi: vi.fn(async () => state.auth),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(state.folderRows),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => {
          const id = `note-${state.insertedNotes.length + 1}`;
          state.insertedNotes.push({ ...v, id });
          return Promise.resolve([{ id }]);
        },
      }),
    }),
  },
}));

vi.mock('@/lib/notes/tag-resolution', () => ({
  upsertTagsByName: vi.fn(async () => []),
  setNoteTags: vi.fn(async () => {}),
}));

vi.mock('@/lib/markdown/from-markdown', () => ({
  markdownToDoc: vi.fn((md: string) => ({ type: 'doc', text: md })),
}));

vi.mock('@/lib/editor/prosemirror-utils', () => ({
  docToPlainText: vi.fn(() => 'plain text'),
}));

import { POST } from './route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost:3200/api/notes/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.auth = { ok: true, userId: 'user-1', via: 'bearer', scope: 'write' };
  state.insertedNotes = [];
});

describe('POST /api/notes/import — token scope (task 04 PR B)', () => {
  it('403s a read-scoped bearer token', async () => {
    state.auth = { ok: true, userId: 'user-1', via: 'bearer', scope: 'read' };
    const res = await POST(jsonRequest({ markdown: '# Hello\n\nBody' }));
    expect(res.status).toBe(403);
    expect(state.insertedNotes).toHaveLength(0);
  });

  it('allows a write-scoped bearer token (unchanged)', async () => {
    state.auth = { ok: true, userId: 'user-1', via: 'bearer', scope: 'write' };
    const res = await POST(jsonRequest({ markdown: '# Hello\n\nBody' }));
    expect(res.status).toBe(200);
    expect(state.insertedNotes).toHaveLength(1);
  });

  it('allows session auth regardless of the (always "write") scope field', async () => {
    state.auth = { ok: true, userId: 'user-1', via: 'session', scope: 'write' };
    const res = await POST(jsonRequest({ markdown: '# Hello\n\nBody' }));
    expect(res.status).toBe(200);
    expect(state.insertedNotes).toHaveLength(1);
  });
});
