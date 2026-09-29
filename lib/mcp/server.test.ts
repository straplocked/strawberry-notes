import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Service-layer mocks ----------------------------------------------------
// Capture the options arg every read tool passes through. The whole point of
// PR 3 is that these mocks see `{ includePrivate: false }` on every call.

const calls: {
  listNotes: Array<{ userId: string; params: unknown; opts?: { includePrivate?: boolean } }>;
  getNote: Array<{ userId: string; id: string; opts?: { includePrivate?: boolean } }>;
  semanticSearch: Array<{
    userId: string;
    query: string;
    opts?: { includePrivate?: boolean; k?: number };
  }>;
  listBacklinks: Array<{ userId: string; id: string; opts?: { includePrivate?: boolean } }>;
  updateNote: Array<{ userId: string; id: string; opts?: { includePrivate?: boolean } }>;
  deleteNote: Array<{
    userId: string;
    id: string;
    opts?: { hard?: boolean; includePrivate?: boolean };
  }>;
  addTagToNote: Array<{
    userId: string;
    noteId: string;
    name: string;
    opts?: { includePrivate?: boolean };
  }>;
  removeTagFromNote: Array<{
    userId: string;
    noteId: string;
    name: string;
    opts?: { includePrivate?: boolean };
  }>;
} = {
  listNotes: [],
  getNote: [],
  semanticSearch: [],
  listBacklinks: [],
  updateNote: [],
  deleteNote: [],
  addTagToNote: [],
  removeTagFromNote: [],
};

vi.mock('../db/client', () => ({ db: {} }));

vi.mock('../notes/service', () => ({
  listNotes: vi.fn(async (userId: string, params: unknown, opts?: { includePrivate?: boolean }) => {
    calls.listNotes.push({ userId, params, opts });
    return [{ id: 'note-1', title: 'Public', private: false }];
  }),
  getNote: vi.fn(async (userId: string, id: string, opts?: { includePrivate?: boolean }) => {
    calls.getNote.push({ userId, id, opts });
    if (opts?.includePrivate === false && id === 'private-id') return null;
    if (id === 'missing') return null;
    return {
      id,
      title: 'Hello',
      folderId: null,
      tagIds: [],
      pinned: false,
      trashedAt: null,
      updatedAt: '2026-05-02T00:00:00Z',
      createdAt: '2026-05-02T00:00:00Z',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      contentText: '',
      encryption: null,
    };
  }),
  createNote: vi.fn(),
  // The write-path mocks below simulate the real service.ts contract: a
  // bearer caller (`opts.includePrivate === false`) gets the same "not
  // found" outcome for `private-id` that the real SQL-level `WHERE
  // ... AND encryption IS NULL` filter produces — zero rows affected, not a
  // thrown error and not a leak of "this id exists but is private."
  updateNote: vi.fn(
    async (
      userId: string,
      id: string,
      _patch: unknown,
      opts?: { includePrivate?: boolean },
    ) => {
      calls.updateNote.push({ userId, id, opts });
      if (opts?.includePrivate === false && id === 'private-id') return null;
      return { id, title: 'Hello', folderId: null, tagIds: [], pinned: false, trashedAt: null, updatedAt: '2026-05-02T00:00:00Z' };
    },
  ),
  deleteNote: vi.fn(
    async (
      userId: string,
      id: string,
      opts?: { hard?: boolean; includePrivate?: boolean },
    ) => {
      calls.deleteNote.push({ userId, id, opts });
      if (opts?.includePrivate === false && id === 'private-id') return false;
      return true;
    },
  ),
  addTagToNote: vi.fn(
    async (
      userId: string,
      noteId: string,
      name: string,
      opts?: { includePrivate?: boolean },
    ) => {
      calls.addTagToNote.push({ userId, noteId, name, opts });
      if (opts?.includePrivate === false && noteId === 'private-id') return null;
      return 'tag-1';
    },
  ),
  removeTagFromNote: vi.fn(
    async (
      userId: string,
      noteId: string,
      name: string,
      opts?: { includePrivate?: boolean },
    ) => {
      calls.removeTagFromNote.push({ userId, noteId, name, opts });
      if (opts?.includePrivate === false && noteId === 'private-id') return false;
      return true;
    },
  ),
}));

vi.mock('../embeddings/search', () => ({
  semanticSearch: vi.fn(
    async (
      userId: string,
      query: string,
      opts?: { includePrivate?: boolean; k?: number },
    ) => {
      calls.semanticSearch.push({ userId, query, opts });
      return [];
    },
  ),
}));

vi.mock('../notes/link-service', () => ({
  listBacklinks: vi.fn(
    async (userId: string, id: string, opts?: { includePrivate?: boolean }) => {
      calls.listBacklinks.push({ userId, id, opts });
      return [];
    },
  ),
}));

vi.mock('../notes/folder-service', () => ({
  listFolders: vi.fn(async () => []),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  FolderError: class FolderError extends Error {},
}));

vi.mock('../notes/tag-service', () => ({
  listTags: vi.fn(async () => []),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
  TagError: class TagError extends Error {},
}));

vi.mock('../embeddings/client', () => ({
  EmbeddingNotConfiguredError: class EmbeddingNotConfiguredError extends Error {},
}));

vi.mock('../markdown/to-markdown', () => ({
  docToMarkdown: vi.fn(() => '# Hello'),
}));

vi.mock('../markdown/from-markdown', () => ({
  markdownToDoc: vi.fn(() => ({ type: 'doc' })),
}));

import { buildMcpServer } from './server';

beforeEach(() => {
  calls.listNotes.length = 0;
  calls.getNote.length = 0;
  calls.semanticSearch.length = 0;
  calls.listBacklinks.length = 0;
  calls.updateNote.length = 0;
  calls.deleteNote.length = 0;
  calls.addTagToNote.length = 0;
  calls.removeTagFromNote.length = 0;
});

/**
 * Reach into the McpServer instance to call a registered tool by name. The
 * SDK doesn't expose a public test-double for this, so we go through the
 * private `_registeredTools` map. If the SDK changes shape this helper is
 * the only place we'd update.
 */
async function callTool(
  server: ReturnType<typeof buildMcpServer>,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const internal = server as unknown as {
    _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
  };
  const tool = internal._registeredTools[name];
  if (!tool) throw new Error(`tool not registered: ${name}`);
  return tool.handler(args);
}

describe('buildMcpServer — Private Notes invisibility (PR 3 contract)', () => {
  const userId = '00000000-0000-0000-0000-000000000000';

  it('list_notes always passes includePrivate=false to the service', async () => {
    const server = buildMcpServer(userId);
    await callTool(server, 'list_notes', {});
    await callTool(server, 'list_notes', { folder: 'pinned', q: 'foo' });
    expect(calls.listNotes).toHaveLength(2);
    for (const c of calls.listNotes) {
      expect(c.opts?.includePrivate).toBe(false);
    }
  });

  it('search_notes (FTS wrapper around listNotes) propagates includePrivate=false', async () => {
    const server = buildMcpServer(userId);
    await callTool(server, 'search_notes', { query: 'taxes' });
    expect(calls.listNotes).toHaveLength(1);
    expect(calls.listNotes[0].opts?.includePrivate).toBe(false);
    expect(calls.listNotes[0].params).toMatchObject({ q: 'taxes' });
  });

  it('search_semantic propagates includePrivate=false alongside k', async () => {
    const server = buildMcpServer(userId);
    await callTool(server, 'search_semantic', { query: 'pricing', k: 5 });
    expect(calls.semanticSearch).toHaveLength(1);
    expect(calls.semanticSearch[0].opts).toMatchObject({ includePrivate: false, k: 5 });
  });

  it('get_note returns "not found" for a private id (mock returns null when includePrivate=false)', async () => {
    const server = buildMcpServer(userId);
    const result = (await callTool(server, 'get_note', {
      id: 'private-id',
    })) as { isError?: boolean };
    expect(result.isError).toBe(true);
    expect(calls.getNote).toHaveLength(1);
    expect(calls.getNote[0].opts?.includePrivate).toBe(false);
    expect(calls.getNote[0].id).toBe('private-id');
  });

  it('get_note returns the note for a plaintext id (mock returns a real row)', async () => {
    const server = buildMcpServer(userId);
    const result = (await callTool(server, 'get_note', {
      id: 'public-id',
    })) as { isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(calls.getNote[0].opts?.includePrivate).toBe(false);
  });

  it('export_note_markdown also passes includePrivate=false and refuses for missing/private', async () => {
    const server = buildMcpServer(userId);
    const ok = (await callTool(server, 'export_note_markdown', {
      id: 'public-id',
    })) as { isError?: boolean };
    expect(ok.isError).toBeUndefined();
    const denied = (await callTool(server, 'export_note_markdown', {
      id: 'private-id',
    })) as { isError?: boolean };
    expect(denied.isError).toBe(true);
    for (const c of calls.getNote) {
      expect(c.opts?.includePrivate).toBe(false);
    }
  });

  it('get_backlinks passes includePrivate=false to the service', async () => {
    const server = buildMcpServer(userId);
    await callTool(server, 'get_backlinks', { id: 'public-id' });
    expect(calls.listBacklinks).toHaveLength(1);
    expect(calls.listBacklinks[0].opts?.includePrivate).toBe(false);
  });
});

describe('buildMcpServer — write tools refuse a private note id (task 04 PR A)', () => {
  // update_note / delete_note / add_tag / remove_tag used to reach the
  // service layer with no `includePrivate` option at all, so a bearer token
  // that already knew (or guessed) a private note's id could mutate it even
  // though every *read* tool refused to reveal it. These tests pin the fix:
  // each write tool now threads `includePrivate: false`, and the service
  // mock's "not found for private-id when includePrivate is false" contract
  // (mirroring the real SQL `WHERE ... AND encryption IS NULL`) must produce
  // the same MCP-visible "not found" a nonexistent id would.
  const userId = '00000000-0000-0000-0000-000000000000';

  it('update_note passes includePrivate=false and refuses a private id', async () => {
    const server = buildMcpServer(userId);
    const ok = (await callTool(server, 'update_note', {
      id: 'public-id',
      title: 'New title',
    })) as { isError?: boolean };
    expect(ok.isError).toBeUndefined();

    const denied = (await callTool(server, 'update_note', {
      id: 'private-id',
      title: 'New title',
    })) as { isError?: boolean };
    expect(denied.isError).toBe(true);

    expect(calls.updateNote).toHaveLength(2);
    for (const c of calls.updateNote) {
      expect(c.opts?.includePrivate).toBe(false);
    }
  });

  it('delete_note passes includePrivate=false and refuses a private id (soft and hard)', async () => {
    const server = buildMcpServer(userId);
    const okSoft = (await callTool(server, 'delete_note', {
      id: 'public-id',
    })) as { isError?: boolean };
    expect(okSoft.isError).toBeUndefined();

    const deniedSoft = (await callTool(server, 'delete_note', {
      id: 'private-id',
    })) as { isError?: boolean };
    expect(deniedSoft.isError).toBe(true);

    const deniedHard = (await callTool(server, 'delete_note', {
      id: 'private-id',
      hard: true,
    })) as { isError?: boolean };
    expect(deniedHard.isError).toBe(true);

    expect(calls.deleteNote).toHaveLength(3);
    for (const c of calls.deleteNote) {
      expect(c.opts?.includePrivate).toBe(false);
    }
  });

  it('add_tag passes includePrivate=false and refuses a private note id', async () => {
    const server = buildMcpServer(userId);
    const ok = (await callTool(server, 'add_tag', {
      noteId: 'public-id',
      name: 'blog',
    })) as { isError?: boolean };
    expect(ok.isError).toBeUndefined();

    const denied = (await callTool(server, 'add_tag', {
      noteId: 'private-id',
      name: 'blog',
    })) as { isError?: boolean };
    expect(denied.isError).toBe(true);

    expect(calls.addTagToNote).toHaveLength(2);
    for (const c of calls.addTagToNote) {
      expect(c.opts?.includePrivate).toBe(false);
    }
  });

  it('remove_tag passes includePrivate=false and refuses a private note id', async () => {
    const server = buildMcpServer(userId);
    const ok = (await callTool(server, 'remove_tag', {
      noteId: 'public-id',
      name: 'blog',
    })) as { isError?: boolean };
    expect(ok.isError).toBeUndefined();

    const denied = (await callTool(server, 'remove_tag', {
      noteId: 'private-id',
      name: 'blog',
    })) as { isError?: boolean };
    expect(denied.isError).toBe(true);

    expect(calls.removeTagFromNote).toHaveLength(2);
    for (const c of calls.removeTagFromNote) {
      expect(c.opts?.includePrivate).toBe(false);
    }
  });
});

describe('buildMcpServer — basic constructor', () => {
  it('constructs an MCP server without throwing', () => {
    const server = buildMcpServer('00000000-0000-0000-0000-000000000000');
    expect(server).toBeDefined();
    // McpServer exposes the underlying Server via a `server` property.
    expect((server as unknown as { server: unknown }).server).toBeDefined();
  });
});
