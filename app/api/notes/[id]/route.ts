import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { noteTags, notes } from '@/lib/db/schema';
import { setNoteTags, upsertTagsByName } from '@/lib/notes/tag-resolution';
import { docToPlainText } from '@/lib/editor/prosemirror-utils';
import type { NoteDTO, PMDoc } from '@/lib/types';

async function loadNote(userId: string, id: string): Promise<NoteDTO | null> {
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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const n = await loadNote(a.userId, id);
  if (!n) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(n);
}

const PatchBody = z.object({
  title: z.string().max(300).optional(),
  content: z
    .object({
      type: z.literal('doc'),
      content: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .optional(),
  folderId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
  tagNames: z.array(z.string()).optional(),
  trashed: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  // Verify ownership first.
  const [existing] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, a.userId)));
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const updates: Partial<typeof notes.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.folderId !== undefined) updates.folderId = parsed.data.folderId;
  if (parsed.data.pinned !== undefined) updates.pinned = parsed.data.pinned;
  if (parsed.data.trashed !== undefined) {
    updates.trashedAt = parsed.data.trashed ? new Date() : null;
  }
  if (parsed.data.content !== undefined) {
    const doc = parsed.data.content as unknown as PMDoc;
    updates.content = doc;
    updates.contentText = docToPlainText(doc);
  }

  await db.update(notes).set(updates).where(eq(notes.id, id));

  if (parsed.data.tagNames !== undefined) {
    const tagIds = await upsertTagsByName(a.userId, parsed.data.tagNames);
    await setNoteTags(id, tagIds);
  }

  const fresh = await loadNote(a.userId, id);
  return NextResponse.json(fresh);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const deleted = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, a.userId)))
    .returning({ id: notes.id });
  if (deleted.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
