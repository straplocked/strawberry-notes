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
} = {
  listNotes: [],
  getNote: [],
  semanticSearch: [],
  listBacklinks: [],
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
  // The remaining service-layer exports are imported for type checking but
  // not exercised in these tests.
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  addTagToNote: vi.fn(),
  removeTagFromNote: vi.fn(),
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

describe('buildMcpServer — basic constructor', () => {
  it('constructs an MCP server without throwing', () => {
    const server = buildMcpServer('00000000-0000-0000-0000-000000000000');
    expect(server).toBeDefined();
    // McpServer exposes the underlying Server via a `server` property.
    expect((server as unknown as { server: unknown }).server).toBeDefined();
  });
});
