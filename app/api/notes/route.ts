import { NextResponse } from 'next/server';
import { and, desc, eq, exists, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { noteTags, notes } from '@/lib/db/schema';
import { setNoteTags, upsertTagsByName } from '@/lib/notes/tag-resolution';
import { docHasImage, emptyDoc, snippetFromDoc } from '@/lib/editor/prosemirror-utils';
import type { NoteListItemDTO, PMDoc } from '@/lib/types';

/**
 * GET /api/notes?folder=all|pinned|trash|<uuid>&tag=<uuid>&q=...
 */
export async function GET(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const url = new URL(req.url);
  const folder = url.searchParams.get('folder') ?? 'all';
  const tagId = url.searchParams.get('tag');
  const q = url.searchParams.get('q')?.trim();

  const conditions = [eq(notes.userId, a.userId)];

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

  if (q && q.length > 0) {
    // Use FTS if the user gave a single-word-ish query; fall back to ILIKE otherwise.
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

  const out: NoteListItemDTO[] = rows.map((r) => ({
    id: r.id,
    folderId: r.folderId,
    title: r.title,
    snippet: snippetFromDoc(r.content as PMDoc) || r.contentText.slice(0, 180),
    pinned: r.pinned,
    updatedAt: r.updatedAt.toISOString(),
    tagIds: tagsByNote.get(r.id) ?? [],
    hasImage: docHasImage(r.content as PMDoc),
  }));
  return NextResponse.json(out);
}

const CreateBody = z.object({
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().max(300).default(''),
  tagNames: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const raw = await req.json().catch(() => ({}));
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const doc = emptyDoc();
  const [n] = await db
    .insert(notes)
    .values({
      userId: a.userId,
      folderId: parsed.data.folderId ?? null,
      title: parsed.data.title,
      content: doc,
      contentText: '',
    })
    .returning();

  if (parsed.data.tagNames && parsed.data.tagNames.length > 0) {
    const tagIds = await upsertTagsByName(a.userId, parsed.data.tagNames);
    await setNoteTags(n.id, tagIds);
  }

  return NextResponse.json({
    id: n.id,
    folderId: n.folderId,
    title: n.title,
    content: n.content,
    contentText: n.contentText,
    pinned: n.pinned,
    tagIds: [],
    trashedAt: n.trashedAt?.toISOString() ?? null,
    updatedAt: n.updatedAt.toISOString(),
    createdAt: n.createdAt.toISOString(),
  });
}
