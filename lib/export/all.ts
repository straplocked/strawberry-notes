/**
 * Export-all orchestrator: pulls every note + referenced attachment for a
 * user, streams them into a zip in `notes/<folder>/<title>-<shortId>.md` +
 * `uploads/<filename>` layout, plus a `manifest.json` describing everything.
 *
 * The archive is written lazily into `lib/zip/streaming.ts`'s ReadableStream,
 * so memory usage stays bounded regardless of workspace size.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { attachments, folders, noteTags, notes, tags } from '../db/schema';
import { docToMarkdown } from '../markdown/to-markdown';
import { uploadsDir } from '../storage';
import type { PMDoc } from '../types';
import { ZipWriter } from '../zip/streaming';
import {
  buildManifest,
  safeComponent,
  toFrontmatter,
  uniquePath,
  type ManifestAttachment,
  type ManifestNote,
} from './manifest';

export interface ExportAllOptions {
  includeTrash?: boolean;
}

/** Start streaming the export. Returns the ReadableStream for the HTTP response. */
export function exportAllToZipStream(
  userId: string,
  opts: ExportAllOptions = {},
): ReadableStream<Uint8Array> {
  const writer = new ZipWriter();
  const stream = writer.stream();

  // Run the producer asynchronously; errors are pushed into the stream.
  void produceArchive(writer, userId, opts).catch((err) => {
    writer.fail(err);
  });

  return stream;
}

async function produceArchive(
  writer: ZipWriter,
  userId: string,
  opts: ExportAllOptions,
): Promise<void> {
  const includeTrash = opts.includeTrash ?? false;

  // --- 1. Load notes ---------------------------------------------------------
  const noteRows = await db
    .select({
      id: notes.id,
      title: notes.title,
      content: notes.content,
      folderId: notes.folderId,
      pinned: notes.pinned,
      trashedAt: notes.trashedAt,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      encryption: notes.encryption,
    })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        includeTrash
          ? or(isNull(notes.trashedAt), isNotNull(notes.trashedAt))!
          : isNull(notes.trashedAt),
      ),
    );

  // --- 2. Load folder names + tags ------------------------------------------
  const folderRows = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(eq(folders.userId, userId));
  const folderName = new Map<string, string>();
  for (const f of folderRows) folderName.set(f.id, f.name);

  const tagsByNote = await loadTagsByNote(
    userId,
    noteRows.map((n) => n.id),
  );

  // --- 3. Compute zip paths (stable, collision-free) ------------------------
  const taken = new Set<string>();
  // Always reserve manifest.json.
  taken.add('manifest.json');

  const manifestNotes: ManifestNote[] = [];
  const noteEntries: Array<{ note: (typeof noteRows)[number]; path: string; tagNames: string[] }> =
    [];

  for (const n of noteRows) {
    const folder =
      n.folderId && folderName.has(n.folderId)
        ? safeComponent(folderName.get(n.folderId)!, { fallback: 'folder' })
        : '_unfiled';
    const titleSlug = safeComponent(n.title || 'untitled', { fallback: 'untitled' });
    const shortId = n.id.slice(0, 8);
    const base = `notes/${folder}/${titleSlug}-${shortId}`;
    // Private notes get a distinct extension so unzippers + future importers
    // can route them through the JSON-envelope path without sniffing content.
    const isPrivate = n.encryption !== null;
    const ext = isPrivate ? '.encrypted.json' : '.md';
    const path = uniquePath(taken, base, ext);

    const tagNames = tagsByNote.get(n.id) ?? [];
    noteEntries.push({ note: n, path, tagNames });
    manifestNotes.push({
      id: n.id,
      title: n.title,
      path,
      folderId: n.folderId,
      folderName: n.folderId ? (folderName.get(n.folderId) ?? null) : null,
      pinned: n.pinned,
      trashed: n.trashedAt !== null,
      tagNames,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      trashedAt: n.trashedAt ? n.trashedAt.toISOString() : null,
      ...(isPrivate ? { encrypted: true as const } : {}),
    });
  }

  // --- 4. Load referenced attachments ---------------------------------------
  const attachmentRows = await db
    .select({
      id: attachments.id,
      noteId: attachments.noteId,
      filename: attachments.filename,
      mime: attachments.mime,
      size: attachments.size,
      storagePath: attachments.storagePath,
    })
    .from(attachments)
    .where(eq(attachments.userId, userId));

  // Only include attachments whose note is present in the export (noteId may
  // be null if the attachment was never attached; we still include them so the
  // operator can GC later without losing data).
  const noteIdSet = new Set(noteRows.map((n) => n.id));
  const attachmentsToExport = attachmentRows.filter(
    (a) => a.noteId === null || noteIdSet.has(a.noteId),
  );

  const manifestAttachments: ManifestAttachment[] = [];
  const attachmentEntries: Array<{
    row: (typeof attachmentRows)[number];
    path: string;
  }> = [];
  for (const a of attachmentsToExport) {
    const stem = safeComponent(stripExt(a.filename) || a.id, { fallback: a.id });
    const ext = extFromStored(a.storagePath);
    const base = `uploads/${stem}-${a.id.slice(0, 8)}`;
    const path = uniquePath(taken, base, ext);
    attachmentEntries.push({ row: a, path });
    manifestAttachments.push({
      id: a.id,
      noteId: a.noteId,
      filename: a.filename,
      mime: a.mime,
      size: a.size,
      path,
    });
  }

  // --- 5. Write manifest.json FIRST so unzippers with "list" see it up top --
  const manifest = buildManifest({
    notes: manifestNotes,
    attachments: manifestAttachments,
    includeTrash,
  });
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n');
  await writer.addFile('manifest.json', manifestBytes);

  // When the archive contains any Private Notes, drop a top-level README so
  // anyone unzipping it understands the .encrypted.json files cannot be read
  // with the export alone — the user's passphrase or recovery code is needed.
  if (manifest.encryption !== undefined) {
    const readme =
      'This archive contains Private Notes — files ending in `.encrypted.json`.\n' +
      '\n' +
      'They are AES-256-GCM ciphertext of the original ProseMirror document and\n' +
      'cannot be read without the user\'s passphrase or recovery code. The\n' +
      'archive carries no decryption material; the user holds the only keys.\n' +
      '\n' +
      'Format documentation: docs/technical/private-notes.md in the\n' +
      'Strawberry Notes repository.\n';
    await writer.addFile('README.txt', new TextEncoder().encode(readme));
  }

  // --- 6. Stream each note's content ---------------------------------------
  for (const e of noteEntries) {
    const isPrivate = e.note.encryption !== null;
    const bytes = isPrivate
      ? new TextEncoder().encode(renderEncryptedNoteJson(e.note))
      : new TextEncoder().encode(renderNoteMarkdown(e.note, e.tagNames));
    await writer.addFile(e.path, bytes, { mtime: e.note.updatedAt });
  }

  // --- 7. Stream each attachment (read from disk) ---------------------------
  const uploadsBase = resolve(uploadsDir()) + '/';
  for (const e of attachmentEntries) {
    const full = resolve(join(uploadsDir(), e.row.storagePath));
    // Containment check: a corrupt storagePath must not escape uploadsDir().
    if (!full.startsWith(uploadsBase)) continue;
    const bytes = await readFileIfPresent(full);
    if (bytes === null) {
      // File is missing on disk — record a placeholder so the archive is still
      // coherent with the manifest rather than dropping the entry silently.
      const placeholder = new TextEncoder().encode(
        `Missing file on disk at export time.\nAttachment id: ${e.row.id}\n`,
      );
      await writer.addFile(e.path + '.missing.txt', placeholder);
      continue;
    }
    // Images are usually already compressed (png/jpeg/webp/avif/gif) — let
    // the zip writer auto-fall-back to STORE when deflate fails to shrink.
    await writer.addFile(e.path, bytes);
  }

  await writer.close();
}

// --- helpers ---------------------------------------------------------------

async function loadTagsByNote(
  userId: string,
  noteIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (noteIds.length === 0) return out;
  const rows = await db
    .select({ noteId: noteTags.noteId, name: tags.name })
    .from(noteTags)
    .innerJoin(tags, and(eq(tags.id, noteTags.tagId), eq(tags.userId, userId)))
    .where(inArray(noteTags.noteId, noteIds));
  for (const r of rows) {
    const arr = out.get(r.noteId) ?? [];
    arr.push(r.name);
    out.set(r.noteId, arr);
  }
  for (const arr of out.values()) arr.sort();
  return out;
}

function renderNoteMarkdown(
  n: {
    id: string;
    title: string;
    content: unknown;
    folderId: string | null;
    pinned: boolean;
    trashedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  tagNames: string[],
): string {
  const front = toFrontmatter({
    id: n.id,
    title: n.title || 'Untitled',
    folderId: n.folderId,
    pinned: n.pinned,
    tagNames,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    trashedAt: n.trashedAt ? n.trashedAt.toISOString() : null,
  });
  const body = docToMarkdown(n.content as PMDoc);
  return `${front}# ${n.title || 'Untitled'}\n\n${body}`;
}

/**
 * Serialise a Private Note as the `sn-private-note-v1` JSON envelope. The
 * `content` column for a private note holds the base64 ciphertext as a JSON
 * string literal (see `lib/notes/service.ts`); we emit it alongside the IV
 * and the user-visible plaintext metadata. Title, folderId, timestamps stay
 * plaintext — they were never encrypted server-side either.
 */
function renderEncryptedNoteJson(n: {
  id: string;
  title: string;
  content: unknown;
  folderId: string | null;
  pinned: boolean;
  trashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  encryption: unknown;
}): string {
  const envelope = {
    format: 'sn-private-note-v1',
    id: n.id,
    title: n.title,
    folderId: n.folderId,
    pinned: n.pinned,
    encryption: n.encryption,
    ciphertext: n.content as string,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    trashedAt: n.trashedAt ? n.trashedAt.toISOString() : null,
  };
  return JSON.stringify(envelope, null, 2) + '\n';
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function extFromStored(storagePath: string): string {
  const i = storagePath.lastIndexOf('.');
  return i > 0 ? storagePath.slice(i) : '';
}

async function readFileIfPresent(path: string): Promise<Uint8Array | null> {
  try {
    await stat(path);
  } catch {
    return null;
  }
  // Small files: one shot. We don't chunk-deflate here because the ZipWriter
  // wants the full CRC up front; streaming per-chunk deflate would require
  // data-descriptors and complicate the reader side.
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const s = createReadStream(path);
    s.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    s.on('end', () => resolve());
    s.on('error', reject);
  });
  return new Uint8Array(Buffer.concat(chunks));
}
