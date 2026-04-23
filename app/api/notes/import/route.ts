import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireUserIdForApi } from '@/lib/auth/require-api';
import { db } from '@/lib/db/client';
import { folders, notes } from '@/lib/db/schema';
import { markdownToDoc } from '@/lib/markdown/from-markdown';
import { docToPlainText } from '@/lib/editor/prosemirror-utils';
import { setNoteTags, upsertTagsByName } from '@/lib/notes/tag-resolution';
import { preflight, withCors } from '@/lib/http/cors';

/**
 * Confirm `folderId` (if present) belongs to `userId`. Without this check a
 * bearer-authenticated request could insert a note into another user's folder
 * — the FK only checks folder existence, not ownership.
 */
async function assertFolderOwned(userId: string, folderId: string | null): Promise<boolean> {
  if (!folderId) return true;
  const [f] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
  return !!f;
}

export const runtime = 'nodejs';

const Query = z.object({
  folderId: z.string().uuid().nullable().optional(),
});

const JsonBody = z.object({
  // Markdown payload. A single note.
  markdown: z.string().min(1).max(2_000_000),
  title: z.string().max(300).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tagNames: z.array(z.string().min(1).max(40)).max(50).optional(),
  // Optional provenance URL (e.g. from a web-clipper). Prepended as a
  // blockquote so the clipped note keeps a link back to the source.
  sourceUrl: z.string().url().max(2000).optional(),
});

/**
 * POST /api/notes/import
 *
 * Two accepted shapes:
 *
 * 1. `multipart/form-data` with one or more `files[]` entries (each a `.md`).
 *    Original bulk-import flow, used by the web UI and existing callers.
 *
 * 2. `application/json` with `{ markdown, title?, folderId?, tagNames?, sourceUrl? }`.
 *    Added for programmatic clients (notably the browser web-clipper
 *    extension) that post a single Markdown blob.
 *
 * Auth accepts either the browser session cookie or a bearer token so the
 * extension can authenticate with a personal access token.
 */
export async function POST(req: Request) {
  const a = await requireUserIdForApi(req);
  if (!a.ok) return withCors(req, a.response);

  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return withCors(req, await handleJson(req, a.userId));
  }

  return withCors(req, await handleMultipart(req, a.userId));
}

async function handleJson(req: Request, userId: string) {
  const raw = await req.json().catch(() => null);
  const parsed = JsonBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const { markdown, sourceUrl } = parsed.data;
  const folderId = parsed.data.folderId ?? null;
  if (!(await assertFolderOwned(userId, folderId))) {
    return NextResponse.json({ error: 'folder not found' }, { status: 404 });
  }

  // Prefer an explicit title; else take the first H1 from the markdown.
  const fromH1 = firstH1(markdown);
  const title =
    (parsed.data.title ?? fromH1 ?? 'Clipped note').slice(0, 300).trim() || 'Clipped note';

  const body = sourceUrl
    ? `> Source: [${sourceUrl}](${sourceUrl})\n\n${stripLeadingH1(markdown)}`
    : stripLeadingH1(markdown);

  const doc = markdownToDoc(body);
  const [n] = await db
    .insert(notes)
    .values({
      userId,
      folderId,
      title,
      content: doc,
      contentText: docToPlainText(doc),
    })
    .returning({ id: notes.id });

  if (parsed.data.tagNames && parsed.data.tagNames.length > 0) {
    const tagIds = await upsertTagsByName(userId, parsed.data.tagNames);
    await setNoteTags(n.id, tagIds);
  }

  return NextResponse.json({ imported: 1, ids: [n.id], id: n.id });
}

async function handleMultipart(req: Request, userId: string) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    folderId: url.searchParams.get('folderId') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const folderId = parsed.data.folderId ?? null;
  if (!(await assertFolderOwned(userId, folderId))) {
    return NextResponse.json({ error: 'folder not found' }, { status: 404 });
  }

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
        userId,
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

export function OPTIONS(req: Request) {
  return preflight(req);
}

function firstH1(md: string): string | null {
  const m = md.match(/^\s*#\s+(.+)\s*\n?/);
  return m ? m[1].trim() : null;
}

function stripLeadingH1(md: string): string {
  const m = md.match(/^\s*#\s+.+\s*\n?/);
  return m ? md.slice(m[0].length) : md;
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
