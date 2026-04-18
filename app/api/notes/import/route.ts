import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';
import { markdownToDoc } from '@/lib/markdown/from-markdown';
import { docToPlainText } from '@/lib/editor/prosemirror-utils';

export const runtime = 'nodejs';

const Query = z.object({
  folderId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/notes/import — multipart upload of one or more .md files.
 * Each file becomes one note. Title is the first H1 if present, else the filename.
 */
export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    folderId: url.searchParams.get('folderId') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const folderId = parsed.data.folderId ?? null;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid form' }, { status: 400 });

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'no files' }, { status: 400 });

  const created: string[] = [];
  for (const file of files) {
    const md = await file.text();
    const { title, body } = stripFirstH1(md, file.name);
    const doc = markdownToDoc(body);
    const [n] = await db
      .insert(notes)
      .values({
        userId: a.userId,
        folderId,
        title,
        content: doc,
        contentText: docToPlainText(doc),
      })
      .returning({ id: notes.id });
    created.push(n.id);
  }
  return NextResponse.json({ imported: created.length, ids: created });
}

function stripFirstH1(md: string, fallbackName: string): { title: string; body: string } {
  const m = md.match(/^\s*#\s+(.+)\s*\n?/);
  if (m) {
    const title = m[1].trim();
    const body = md.slice(m[0].length);
    return { title, body };
  }
  const title = fallbackName.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported note';
  return { title, body: md };
}
