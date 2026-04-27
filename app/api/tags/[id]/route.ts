import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { deleteTag, renameTag, TagError } from '@/lib/notes/tag-service';

const PatchBody = z.object({
  name: z.string().min(1).max(40),
});

/**
 * PATCH /api/tags/:id { name } — rename or merge.
 *
 * If `name` is already taken by another of the user's tags, this performs a
 * merge: every note tagged with the source ends up tagged with the existing
 * one, and the source is deleted. The response body's `merged` flag tells the
 * client which path was taken so the UI can refetch tag counts and any
 * affected note caches.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  try {
    const result = await renameTag(a.userId, id, parsed.data.name);
    if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TagError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const ok = await deleteTag(a.userId, id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
