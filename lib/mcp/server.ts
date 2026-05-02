import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { docToMarkdown } from '../markdown/to-markdown';
import { markdownToDoc } from '../markdown/from-markdown';
import { EmbeddingNotConfiguredError } from '../embeddings/client';
import { semanticSearch } from '../embeddings/search';
import {
  addTagToNote,
  createNote,
  deleteNote,
  getNote,
  listNotes,
  removeTagFromNote,
  updateNote,
} from '../notes/service';
import { createFolder, FolderError, listFolders, updateFolder } from '../notes/folder-service';
import { listBacklinks } from '../notes/link-service';
import { deleteTag, listTags, renameTag, TagError } from '../notes/tag-service';
import type { PMDoc } from '../types';

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
 *
 * MCP callers — by definition bearer-token-only (the route gates session
 * cookies in [app/api/mcp/route.ts](../../app/api/mcp/route.ts)) — never see
 * the user's Private Notes. Every read tool below threads
 * `includePrivate: false` into the underlying service call. The session
 * (browser) read paths still see private notes via the same service
 * functions, called from the `/api/notes/*` route handlers.
 */
export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: 'strawberry-notes', version: '1.0.0' });

  // Bound once so each tool body just spreads it into its options arg.
  // Renaming this to `MCP_READ_OPTS` would be more dramatic but the call
  // sites read fine with the current name.
  const mcpReadOpts = { includePrivate: false } as const;

  server.registerTool(
    'list_notes',
    {
      description:
        'List notes belonging to the authenticated user. Use `folder` to filter: "all" (default), "pinned", "trash", a folder id, or a time-range token ("today", "yesterday", "past7", "past30"). Use `tag` for a tag id. Use `q` for full-text search. Notes the user has marked Private are never returned via MCP.',
      inputSchema: {
        folder: z.string().optional(),
        tag: z.string().optional(),
        q: z.string().optional(),
      },
    },
    async (args) => {
      const rows = await listNotes(
        userId,
        {
          folder: args.folder,
          tagId: args.tag ?? null,
          q: args.q ?? null,
        },
        mcpReadOpts,
      );
      return jsonResult(rows);
    },
  );

  server.registerTool(
    'search_notes',
    {
      description:
        'Full-text (keyword) search over all non-trashed notes. Good for exact strings, names, filenames, and short queries. For conceptual / meaning-based queries (e.g. "notes about burnout", "things I said about pricing"), prefer `search_semantic`. Private Notes are excluded.',
      inputSchema: { query: z.string().min(1) },
    },
    async ({ query }) => {
      const rows = await listNotes(userId, { q: query }, mcpReadOpts);
      return jsonResult(rows);
    },
  );

  server.registerTool(
    'search_semantic',
    {
      description:
        'Semantic (vector) search over all non-trashed notes. Prefer this over `search_notes` when the query describes a topic, concept, mood, or question rather than a specific string. Results are ranked by cosine similarity and include a `score` field in [0, 1] (higher = closer). Returns the same note shape as `list_notes`. Private Notes are excluded. Errors if the server has no embedding provider configured.',
      inputSchema: {
        query: z.string().min(1).max(2000),
        k: z.number().int().positive().max(50).optional(),
      },
    },
    async ({ query, k }) => {
      try {
        const rows = await semanticSearch(userId, query, { k, ...mcpReadOpts });
        return jsonResult(rows);
      } catch (err) {
        if (err instanceof EmbeddingNotConfiguredError) {
          return { ...textResult(err.message), isError: true };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'get_note',
    {
      description:
        'Fetch a single note by id. Returns title, markdown body, tag ids, folder id, and timestamps. Returns "not found" for any note the user has marked Private — the body is encrypted and not visible to MCP.',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      // `includePrivate: false` short-circuits to null for private rows, so
      // we never need to look at `note.encryption` here — but the explicit
      // narrow keeps `note.content` typed as PMDoc for `docToMarkdown`.
      const note = await getNote(userId, id, mcpReadOpts);
      if (!note || note.encryption !== null) {
        return { ...textResult('not found'), isError: true };
      }
      return jsonResult({
        id: note.id,
        title: note.title,
        folderId: note.folderId,
        tagIds: note.tagIds,
        pinned: note.pinned,
        trashedAt: note.trashedAt,
        updatedAt: note.updatedAt,
        createdAt: note.createdAt,
        markdown: docToMarkdown(note.content as PMDoc),
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
      description:
        'Create a new folder. Color is a `#rrggbb` hex string; defaults to `#e33d4e`. ' +
        'Pass `parentId` to nest the folder under another one (omit or null for top level).',
      inputSchema: {
        name: z.string().min(1).max(80),
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .optional(),
        parentId: z.string().uuid().nullable().optional(),
      },
    },
    async ({ name, color, parentId }) => {
      try {
        return jsonResult(await createFolder(userId, { name, color, parentId }));
      } catch (err) {
        if (err instanceof FolderError) {
          return { ...textResult(err.message), isError: true };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'update_folder',
    {
      description:
        'Update a folder. Any omitted field is left unchanged. Set `parentId` to null to lift a folder back to the top level. Errors if the move would create a cycle (a folder cannot be moved under one of its own descendants).',
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .optional(),
        position: z.number().int().min(0).optional(),
        parentId: z.string().uuid().nullable().optional(),
      },
    },
    async ({ id, name, color, position, parentId }) => {
      try {
        const updated = await updateFolder(userId, id, { name, color, position, parentId });
        if (!updated) return { ...textResult('not found'), isError: true };
        return jsonResult(updated);
      } catch (err) {
        if (err instanceof FolderError) {
          return { ...textResult(err.message), isError: true };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'list_tags',
    { description: 'List the user’s tags with note counts.', inputSchema: {} },
    async () => jsonResult(await listTags(userId)),
  );

  server.registerTool(
    'rename_tag',
    {
      description:
        'Rename a tag. If `name` is already used by another of the user’s tags, the two are merged — every note tagged with the source ends up tagged with the existing one, and the source is deleted. Returns `{ id, merged }`: `id` is the surviving tag, `merged` flags whether a merge happened.',
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).max(40),
      },
    },
    async ({ id, name }) => {
      try {
        const result = await renameTag(userId, id, name);
        if (!result) return { ...textResult('not found'), isError: true };
        return jsonResult(result);
      } catch (err) {
        if (err instanceof TagError) {
          return { ...textResult(err.message), isError: true };
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'delete_tag',
    {
      description:
        'Delete a tag. The tag is removed from every note that had it; the notes themselves are not touched.',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const ok = await deleteTag(userId, id);
      if (!ok) return { ...textResult('not found'), isError: true };
      return jsonResult({ id, deleted: true });
    },
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
    'get_backlinks',
    {
      description:
        'List notes that link to the given note via a `[[Wiki-style]]` title link. Returns source notes newest-updated first. Returns an empty list when the target is a Private Note.',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => jsonResult(await listBacklinks(userId, id, mcpReadOpts)),
  );

  server.registerTool(
    'export_note_markdown',
    {
      description:
        'Return a note as Markdown (same output as the REST export endpoint). Returns "not found" for Private Notes — the body is encrypted and the server cannot render it.',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const note = await getNote(userId, id, mcpReadOpts);
      if (!note || note.encryption !== null) {
        return { ...textResult('not found'), isError: true };
      }
      return textResult(docToMarkdown(note.content as PMDoc));
    },
  );

  return server;
}
