import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { deleteNote, getNote, updateNote } from '@/lib/notes/service';
import type { PMDoc } from '@/lib/types';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const n = await getNote(a.userId, id);
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

  const fresh = await updateNote(a.userId, id, {
    title: parsed.data.title,
    content: parsed.data.content as unknown as PMDoc | undefined,
    folderId: parsed.data.folderId,
    pinned: parsed.data.pinned,
    tagNames: parsed.data.tagNames,
    trashed: parsed.data.trashed,
  });
  if (!fresh) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(fresh);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const ok = await deleteNote(a.userId, id, { hard: true });
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
