import { and, desc, eq, exists, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { noteTags, notes, tags } from '../db/schema';
import {
  docHasImage,
  docToPlainText,
  emptyDoc,
  snippetFromDoc,
} from '../editor/prosemirror-utils';
import { kickEmbeddingWorker } from '../embeddings/worker';
import { setNoteTags, upsertTagsByName } from './tag-resolution';
import {
  resolvePendingLinksForTitle,
  syncOutboundLinks,
  unresolveLinksTo,
} from './link-service';
import { deleteAttachmentsForNote } from './gc';
import type { NoteDTO, NoteListItemDTO, PMDoc } from '../types';

export interface ListNotesParams {
  folder?: string;
  tagId?: string | null;
  q?: string | null;
}

// Shared SQL fragment: aggregate tag ids into a text[] per note via the left-joined note_tags.
const tagIdsAgg = sql<
  string[]
>`coalesce(array_agg(${noteTags.tagId}) filter (where ${noteTags.tagId} is not null), '{}')`;

export async function listNotes(
  userId: string,
  params: ListNotesParams = {},
): Promise<NoteListItemDTO[]> {
  const folder = params.folder ?? 'all';
  const tagId = params.tagId ?? null;
  const q = params.q?.trim() ?? '';

  const conditions = [eq(notes.userId, userId)];

  if (folder === 'pinned') {
    conditions.push(eq(notes.pinned, true));
    conditions.push(isNull(notes.trashedAt));
  } else if (folder === 'trash') {
    conditions.push(isNotNull(notes.trashedAt));
  } else if (folder === 'all') {
    conditions.push(isNull(notes.trashedAt));
  } else {
    conditions.push(eq(notes.folderId, folder));
    conditions.push(isNull(notes.trashedAt));
  }

  if (tagId) {
    conditions.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(noteTags)
          .where(and(eq(noteTags.noteId, notes.id), eq(noteTags.tagId, tagId))),
      ),
    );
  }

  if (q.length > 0) {
    // Primary path: the `content_tsv` GIN-indexed generated column (see drizzle/0001_fts.sql).
    // ILIKE on title is kept as a short/prefix-query fallback; the result set is
    // already constrained by userId so the scan is cheap.
    conditions.push(
      or(
        sql`"content_tsv" @@ websearch_to_tsquery('english', ${q})`,
        ilike(notes.title, `%${q}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: notes.id,
      folderId: notes.folderId,
      title: notes.title,
      snippet: notes.snippet,
      contentText: notes.contentText,
      hasImage: notes.hasImage,
      pinned: notes.pinned,
      updatedAt: notes.updatedAt,
      tagIds: tagIdsAgg,
    })
    .from(notes)
    .leftJoin(noteTags, eq(noteTags.noteId, notes.id))
    .where(and(...conditions))
    .groupBy(notes.id)
    .orderBy(desc(notes.pinned), desc(notes.updatedAt))
    .limit(500);

  return rows.map((r) => ({
    id: r.id,
    folderId: r.folderId,
    title: r.title,
    // Fallback to contentText slice for rows written before the backfill ran.
    snippet: r.snippet || r.contentText.slice(0, 180),
    pinned: r.pinned,
    updatedAt: r.updatedAt.toISOString(),
    tagIds: r.tagIds ?? [],
    hasImage: r.hasImage,
  }));
}

export async function getNote(userId: string, id: string): Promise<NoteDTO | null> {
  const [n] = await db
    .select({
      id: notes.id,
      folderId: notes.folderId,
      title: notes.title,
      content: notes.content,
      contentText: notes.contentText,
      pinned: notes.pinned,
      trashedAt: notes.trashedAt,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      tagIds: tagIdsAgg,
    })
    .from(notes)
    .leftJoin(noteTags, eq(noteTags.noteId, notes.id))
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .groupBy(notes.id);
  if (!n) return null;
  return {
    id: n.id,
    folderId: n.folderId,
    title: n.title,
    content: n.content as PMDoc,
    contentText: n.contentText,
    pinned: n.pinned,
    tagIds: n.tagIds ?? [],
    trashedAt: n.trashedAt ? n.trashedAt.toISOString() : null,
    updatedAt: n.updatedAt.toISOString(),
    createdAt: n.createdAt.toISOString(),
  };
}

export interface CreateNoteInput {
  folderId?: string | null;
  title?: string;
  content?: PMDoc;
  tagNames?: string[];
}

export async function createNote(userId: string, input: CreateNoteInput): Promise<NoteDTO> {
  const doc = input.content ?? emptyDoc();
  const [n] = await db
    .insert(notes)
    .values({
      userId,
      folderId: input.folderId ?? null,
      title: input.title ?? '',
      content: doc,
      contentText: docToPlainText(doc),
      snippet: snippetFromDoc(doc),
      hasImage: docHasImage(doc),
      // Fresh rows are always stale until the worker embeds them.
      embeddingStale: true,
    })
    .returning();

  let tagIds: string[] = [];
  if (input.tagNames && input.tagNames.length > 0) {
    tagIds = await upsertTagsByName(userId, input.tagNames);
    await setNoteTags(n.id, tagIds);
  }

  await syncOutboundLinks(userId, n.id, doc);
  if (n.title.trim()) {
    await resolvePendingLinksForTitle(userId, n.id, n.title);
  }

  // Fire-and-forget: do not block the save path on embedding work.
  kickEmbeddingWorker();

  return {
    id: n.id,
    folderId: n.folderId,
    title: n.title,
    content: n.content as PMDoc,
    contentText: n.contentText,
    pinned: n.pinned,
    tagIds,
    trashedAt: n.trashedAt?.toISOString() ?? null,
    updatedAt: n.updatedAt.toISOString(),
    createdAt: n.createdAt.toISOString(),
  };
}

export interface UpdateNoteInput {
  title?: string;
  content?: PMDoc;
  folderId?: string | null;
  pinned?: boolean;
  tagNames?: string[];
  trashed?: boolean;
}

export async function updateNote(
  userId: string,
  id: string,
  patch: UpdateNoteInput,
): Promise<NoteDTO | null> {
  const updates: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.folderId !== undefined) updates.folderId = patch.folderId;
  if (patch.pinned !== undefined) updates.pinned = patch.pinned;
  if (patch.trashed !== undefined) {
    updates.trashedAt = patch.trashed ? new Date() : null;
  }
  // Only the content mutation invalidates the embedding. Title-only and
  // folder/pinned/tag changes don't need a re-embed.
  const contentChanged = patch.content !== undefined;
  if (contentChanged && patch.content !== undefined) {
    updates.content = patch.content;
    updates.contentText = docToPlainText(patch.content);
    updates.snippet = snippetFromDoc(patch.content);
    updates.hasImage = docHasImage(patch.content);
    updates.embeddingStale = true;
  }
  // A title change also affects the embedding input (we prepend the title).
  if (patch.title !== undefined) {
    updates.embeddingStale = true;
  }

  // Ownership is enforced in the WHERE; returning() tells us whether the row
  // existed for this user, saving the ownership preflight round-trip.
  const updated = await db
    .update(notes)
    .set(updates)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id, title: notes.title });
  if (updated.length === 0) return null;

  if (patch.tagNames !== undefined) {
    const tagIds = await upsertTagsByName(userId, patch.tagNames);
    await setNoteTags(id, tagIds);
  }

  if (patch.content !== undefined) {
    await syncOutboundLinks(userId, id, patch.content);
  }
  if (patch.title !== undefined) {
    // Links that previously matched this note by its old title are invalidated;
    // rows matching the new title are picked up.
    await unresolveLinksTo(userId, id);
    if (updated[0].title.trim()) {
      await resolvePendingLinksForTitle(userId, id, updated[0].title);
    }
  }

  if (updates.embeddingStale === true) {
    kickEmbeddingWorker();
  }

  return getNote(userId, id);
}

export async function deleteNote(
  userId: string,
  id: string,
  opts: { hard?: boolean } = {},
): Promise<boolean> {
  if (opts.hard) {
    // Clean up attachment files + rows BEFORE deleting the note itself —
    // once the note row is gone we lose the noteId linkage and the orphan
    // sweep would have to pick them up on a later run. Doing it here keeps
    // hard-delete symmetric with the filesystem.
    await deleteAttachmentsForNote(userId, id);
    const rows = await db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .returning({ id: notes.id });
    return rows.length > 0;
  }
  const rows = await db
    .update(notes)
    .set({ trashedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return rows.length > 0;
}

/** Add a tag (by name) to a note. Idempotent. Returns the resolved tag id. */
export async function addTagToNote(
  userId: string,
  noteId: string,
  name: string,
): Promise<string | null> {
  const [owned] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
  if (!owned) return null;
  const [tagId] = await upsertTagsByName(userId, [name]);
  if (!tagId) return null;
  await db.insert(noteTags).values({ noteId, tagId }).onConflictDoNothing();
  return tagId;
}

/** Remove a tag (by name) from a note. Idempotent. */
export async function removeTagFromNote(
  userId: string,
  noteId: string,
  name: string,
): Promise<boolean> {
  const [owned] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
  if (!owned) return false;
  const clean = name.trim().toLowerCase();
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, clean)));
  if (!tag) return false;
  await db
    .delete(noteTags)
    .where(and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tag.id)));
  return true;
}
