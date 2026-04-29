import { and, desc, eq, exists, gte, ilike, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
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
import { isTimeRange, timeRangeBounds, type TimeRange } from './time-range';
import {
  fireNoteCreated,
  fireNoteLinked,
  fireNoteTagged,
  fireNoteTrashed,
  fireNoteUpdated,
  noteRef,
} from '../webhooks/fire';
import type { NoteDTO, NoteListItemDTO, PMDoc } from '../types';

export interface ListNotesParams {
  /**
   * Folder filter. Special tokens:
   *   - "all"        — every non-trashed note (default)
   *   - "pinned"     — pinned non-trashed notes
   *   - "trash"      — soft-deleted notes only
   *   - "today" / "yesterday" / "past7" / "past30" — time-range filter on
   *     `updatedAt`; non-trashed notes only. See `lib/notes/time-range.ts`.
   *   - any other value is treated as a folder uuid.
   */
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
  } else if (isTimeRange(folder)) {
    const { from, to } = timeRangeBounds(folder as TimeRange);
    conditions.push(isNull(notes.trashedAt));
    conditions.push(gte(notes.updatedAt, from));
    if (to) conditions.push(lt(notes.updatedAt, to));
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

  const newlyResolvedOutbound = await syncOutboundLinks(userId, n.id, doc);
  let newlyResolvedInbound: string[] = [];
  if (n.title.trim()) {
    newlyResolvedInbound = await resolvePendingLinksForTitle(userId, n.id, n.title);
  }

  // Fire-and-forget: do not block the save path on embedding work.
  kickEmbeddingWorker();

  const dto: NoteDTO = {
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

  // Fan-out webhook events (best-effort, non-blocking).
  fireNoteCreated(userId, noteRef(dto));
  for (const link of newlyResolvedOutbound) {
    void fireLinkedFor(userId, link.sourceId, link.targetId);
  }
  for (const sourceId of newlyResolvedInbound) {
    void fireLinkedFor(userId, sourceId, n.id);
  }

  return dto;
}

async function fireLinkedFor(
  userId: string,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const [src, tgt] = await Promise.all([
    getNote(userId, sourceId),
    getNote(userId, targetId),
  ]);
  if (!src || !tgt) return;
  fireNoteLinked(userId, noteRef(src), noteRef(tgt));
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

  let newlyResolvedOutbound: Array<{ sourceId: string; targetId: string }> = [];
  let newlyResolvedInbound: string[] = [];
  if (patch.content !== undefined) {
    newlyResolvedOutbound = await syncOutboundLinks(userId, id, patch.content);
  }
  if (patch.title !== undefined) {
    // Links that previously matched this note by its old title are invalidated;
    // rows matching the new title are picked up.
    await unresolveLinksTo(userId, id);
    if (updated[0].title.trim()) {
      newlyResolvedInbound = await resolvePendingLinksForTitle(userId, id, updated[0].title);
    }
  }

  if (updates.embeddingStale === true) {
    kickEmbeddingWorker();
  }

  const dto = await getNote(userId, id);
  if (!dto) return null;

  // Fan-out webhook events. `note.trashed` displaces `note.updated` when the
  // patch's primary intent is the soft-delete flag — consumers care about the
  // transition, not "the note was updated and also happens to be trashed now."
  if (patch.trashed === true) {
    fireNoteTrashed(userId, noteRef(dto));
  } else {
    const changedFields: NonNullable<Parameters<typeof fireNoteUpdated>[2]> = [];
    if (patch.title !== undefined) changedFields.push('title');
    if (patch.content !== undefined) changedFields.push('content');
    if (patch.folderId !== undefined) changedFields.push('folderId');
    if (patch.pinned !== undefined) changedFields.push('pinned');
    if (patch.tagNames !== undefined) changedFields.push('tags');
    if (changedFields.length > 0) {
      fireNoteUpdated(userId, noteRef(dto), changedFields);
    }
  }

  for (const link of newlyResolvedOutbound) {
    void fireLinkedFor(userId, link.sourceId, link.targetId);
  }
  for (const sourceId of newlyResolvedInbound) {
    void fireLinkedFor(userId, sourceId, id);
  }

  return dto;
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

  // Soft-delete: capture state BEFORE flipping trashedAt so we can fire the
  // webhook event with the note's pre-trash ref. After update, the row is
  // hidden from default list views but `getNote` still returns it.
  const dto = await getNote(userId, id);
  const rows = await db
    .update(notes)
    .set({ trashedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  if (rows.length === 0) return false;
  if (dto) fireNoteTrashed(userId, noteRef(dto));
  return true;
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
  // `returning` lets us tell whether the row was newly inserted (i.e. the
  // tag was actually added) or already present (idempotent no-op). Only fire
  // the `note.tagged` webhook for true additions.
  const inserted = await db
    .insert(noteTags)
    .values({ noteId, tagId })
    .onConflictDoNothing()
    .returning({ noteId: noteTags.noteId });
  if (inserted.length > 0) {
    const dto = await getNote(userId, noteId);
    if (dto) {
      fireNoteTagged(userId, noteRef(dto), { id: tagId, name: name.trim().toLowerCase() });
    }
  }
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
