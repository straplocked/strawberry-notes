import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { createNote, listNotes } from '@/lib/notes/service';

/**
 * GET /api/notes?folder=all|pinned|trash|<uuid>&tag=<uuid>&q=...
 */
export async function GET(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const url = new URL(req.url);
  const out = await listNotes(a.userId, {
    folder: url.searchParams.get('folder') ?? 'all',
    tagId: url.searchParams.get('tag'),
    q: url.searchParams.get('q'),
  });
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

  const note = await createNote(a.userId, {
    folderId: parsed.data.folderId ?? null,
    title: parsed.data.title,
    tagNames: parsed.data.tagNames,
  });
  return NextResponse.json(note);
}
