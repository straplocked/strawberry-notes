import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { docToMarkdown } from '../markdown/to-markdown';
import { markdownToDoc } from '../markdown/from-markdown';
import {
  addTagToNote,
  createNote,
  deleteNote,
  getNote,
  listNotes,
  removeTagFromNote,
  updateNote,
} from '../notes/service';
import { createFolder, listFolders } from '../notes/folder-service';
import { listTags } from '../notes/tag-service';

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function jsonResult(value: unknown) {
  return textResult(JSON.stringify(value, null, 2));
}

/**
 * Build a per-request MCP server scoped to a single user. Every tool closes
 * over `userId`, so there is no way for a tool argument to reach another
 * user's data.
 */
export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: 'strawberry-notes', version: '1.0.0' });

  server.registerTool(
    'list_notes',
    {
      description:
        'List notes belonging to the authenticated user. Use `folder` to filter: "all" (default), "pinned", "trash", or a folder id. Use `tag` for a tag id. Use `q` for full-text search.',
      inputSchema: {
        folder: z.string().optional(),
        tag: z.string().optional(),
        q: z.string().optional(),
      },
    },
    async (args) => {
      const rows = await listNotes(userId, {
        folder: args.folder,
        tagId: args.tag ?? null,
        q: args.q ?? null,
      });
      return jsonResult(rows);
    },
  );

  server.registerTool(
    'search_notes',
    {
      description: 'Full-text search over all non-trashed notes.',
      inputSchema: { query: z.string().min(1) },
    },
    async ({ query }) => {
      const rows = await listNotes(userId, { q: query });
      return jsonResult(rows);
    },
  );

  server.registerTool(
    'get_note',
    {
      description:
        'Fetch a single note by id. Returns title, markdown body, tag ids, folder id, and timestamps.',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const note = await getNote(userId, id);
      if (!note) return { ...textResult('not found'), isError: true };
      return jsonResult({
        id: note.id,
        title: note.title,
        folderId: note.folderId,
        tagIds: note.tagIds,
        pinned: note.pinned,
        trashedAt: note.trashedAt,
        updatedAt: note.updatedAt,
        createdAt: note.createdAt,
        markdown: docToMarkdown(note.content),
      });
    },
  );

  server.registerTool(
    'create_note',
    {
      description:
        'Create a new note. Accepts optional folder id, title, markdown body, and tag names. Returns the created note.',
      inputSchema: {
        folderId: z.string().uuid().nullable().optional(),
        title: z.string().max(300).optional(),
        markdown: z.string().optional(),
        tagNames: z.array(z.string()).optional(),
      },
    },
    async ({ folderId, title, markdown, tagNames }) => {
      const note = await createNote(userId, {
        folderId: folderId ?? null,
        title: title ?? '',
        content: markdown ? markdownToDoc(markdown) : undefined,
        tagNames,
      });
      return jsonResult({
        id: note.id,
        title: note.title,
        folderId: note.folderId,
        tagIds: note.tagIds,
        updatedAt: note.updatedAt,
      });
    },
  );

  server.registerTool(
    'update_note',
    {
      description:
        'Update fields on an existing note. Any omitted field is left unchanged. `markdown` replaces the body.',
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().max(300).optional(),
        markdown: z.string().optional(),
        folderId: z.string().uuid().nullable().optional(),
        pinned: z.boolean().optional(),
        tagNames: z.array(z.string()).optional(),
        trashed: z.boolean().optional(),
      },
    },
    async ({ id, title, markdown, folderId, pinned, tagNames, trashed }) => {
      const fresh = await updateNote(userId, id, {
        title,
        content: markdown !== undefined ? markdownToDoc(markdown) : undefined,
        folderId,
        pinned,
        tagNames,
        trashed,
      });
      if (!fresh) return { ...textResult('not found'), isError: true };
      return jsonResult({
        id: fresh.id,
        title: fresh.title,
        folderId: fresh.folderId,
        tagIds: fresh.tagIds,
        pinned: fresh.pinned,
        trashedAt: fresh.trashedAt,
        updatedAt: fresh.updatedAt,
      });
    },
  );

  server.registerTool(
    'delete_note',
    {
      description:
        'Delete a note. By default performs a soft delete (moves to Trash). Pass `hard: true` to permanently remove.',
      inputSchema: {
        id: z.string().uuid(),
        hard: z.boolean().optional(),
      },
    },
    async ({ id, hard }) => {
      const ok = await deleteNote(userId, id, { hard: !!hard });
      if (!ok) return { ...textResult('not found'), isError: true };
      return jsonResult({ id, deleted: hard ? 'hard' : 'soft' });
    },
  );

  server.registerTool(
    'list_folders',
    { description: 'List the user’s folders with note counts.', inputSchema: {} },
    async () => jsonResult(await listFolders(userId)),
  );

  server.registerTool(
    'create_folder',
    {
      description: 'Create a new folder. Color is a `#rrggbb` hex string; defaults to `#e33d4e`.',
      inputSchema: {
        name: z.string().min(1).max(80),
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .optional(),
      },
    },
    async ({ name, color }) => jsonResult(await createFolder(userId, { name, color })),
  );

  server.registerTool(
    'list_tags',
    { description: 'List the user’s tags with note counts.', inputSchema: {} },
    async () => jsonResult(await listTags(userId)),
  );

  server.registerTool(
    'add_tag',
    {
      description:
        'Add a tag (by name) to a note. Creates the tag if it does not exist. Idempotent.',
      inputSchema: {
        noteId: z.string().uuid(),
        name: z.string().min(1).max(40),
      },
    },
    async ({ noteId, name }) => {
      const tagId = await addTagToNote(userId, noteId, name);
      if (!tagId) return { ...textResult('note not found'), isError: true };
      return jsonResult({ noteId, tagId });
    },
  );

  server.registerTool(
    'remove_tag',
    {
      description: 'Remove a tag (by name) from a note. Idempotent.',
      inputSchema: {
        noteId: z.string().uuid(),
        name: z.string().min(1).max(40),
      },
    },
    async ({ noteId, name }) => {
      const ok = await removeTagFromNote(userId, noteId, name);
      if (!ok) return { ...textResult('note not found'), isError: true };
      return jsonResult({ noteId, name });
    },
  );

  server.registerTool(
    'export_note_markdown',
    {
      description: 'Return a note as Markdown (same output as the REST export endpoint).',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const note = await getNote(userId, id);
      if (!note) return { ...textResult('not found'), isError: true };
      return textResult(docToMarkdown(note.content));
    },
  );

  return server;
}
