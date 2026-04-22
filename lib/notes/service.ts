import { and, desc, eq, exists, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { noteTags, notes, tags } from '../db/schema';
import { docHasImage, docToPlainText, emptyDoc, snippetFromDoc } from '../editor/prosemirror-utils';
import { setNoteTags, upsertTagsByName } from './tag-resolution';
import type { NoteDTO, NoteListItemDTO, PMDoc } from '../types';

export interface ListNotesParams {
  folder?: string;
  tagId?: string | null;
  q?: string | null;
}

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
    const tsquery = sql`websearch_to_tsquery('english', ${q})`;
    conditions.push(
      or(
        sql`${notes.contentText} @@ ${tsquery}`,
        sql`${notes.title} @@ ${tsquery}`,
        ilike(notes.title, `%${q}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: notes.id,
      folderId: notes.folderId,
      title: notes.title,
      content: notes.content,
      contentText: notes.contentText,
      pinned: notes.pinned,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(and(...conditions))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt))
    .limit(500);

  const ids = rows.map((r) => r.id);
  const tagRows =
    ids.length === 0
      ? []
      : await db
          .select({ noteId: noteTags.noteId, tagId: noteTags.tagId })
          .from(noteTags)
          .where(
            sql`${noteTags.noteId} in (${sql.join(
              ids.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`,
          );
  const tagsByNote = new Map<string, string[]>();
  for (const t of tagRows) {
    const list = tagsByNote.get(t.noteId) ?? [];
    list.push(t.tagId);
    tagsByNote.set(t.noteId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    folderId: r.folderId,
    title: r.title,
    snippet: snippetFromDoc(r.content as PMDoc) || r.contentText.slice(0, 180),
    pinned: r.pinned,
    updatedAt: r.updatedAt.toISOString(),
    tagIds: tagsByNote.get(r.id) ?? [],
    hasImage: docHasImage(r.content as PMDoc),
  }));
}

export async function getNote(userId: string, id: string): Promise<NoteDTO | null> {
  const [n] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)));
  if (!n) return null;
  const tagRows = await db
    .select({ tagId: noteTags.tagId })
    .from(noteTags)
    .where(eq(noteTags.noteId, n.id));
  return {
    id: n.id,
    folderId: n.folderId,
    title: n.title,
    content: n.content as PMDoc,
    contentText: n.contentText,
    pinned: n.pinned,
    tagIds: tagRows.map((r) => r.tagId),
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
    })
    .returning();

  let tagIds: string[] = [];
  if (input.tagNames && input.tagNames.length > 0) {
    tagIds = await upsertTagsByName(userId, input.tagNames);
    await setNoteTags(n.id, tagIds);
  }

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
  const [existing] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)));
  if (!existing) return null;

  const updates: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.folderId !== undefined) updates.folderId = patch.folderId;
  if (patch.pinned !== undefined) updates.pinned = patch.pinned;
  if (patch.trashed !== undefined) {
    updates.trashedAt = patch.trashed ? new Date() : null;
  }
  if (patch.content !== undefined) {
    updates.content = patch.content;
    updates.contentText = docToPlainText(patch.content);
  }

  await db.update(notes).set(updates).where(eq(notes.id, id));

  if (patch.tagNames !== undefined) {
    const tagIds = await upsertTagsByName(userId, patch.tagNames);
    await setNoteTags(id, tagIds);
  }

  return getNote(userId, id);
}

export async function deleteNote(
  userId: string,
  id: string,
  opts: { hard?: boolean } = {},
): Promise<boolean> {
  if (opts.hard) {
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
  await db
    .insert(noteTags)
    .values({ noteId, tagId })
    .onConflictDoNothing();
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
