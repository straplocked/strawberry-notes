import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { requireUserIdForApi } from '@/lib/auth/require-api';
import { createFolder, FolderError, listFolders } from '@/lib/notes/folder-service';
import { preflight, withCors } from '@/lib/http/cors';

/**
 * GET accepts either a session cookie (browser app) or `Authorization: Bearer <token>`
 * so programmatic clients such as the browser extension can list folders to
 * populate a target-folder dropdown.
 */
export async function GET(req: Request) {
  const a = await requireUserIdForApi(req);
  if (!a.ok) return withCors(req, a.response);
  const out = await listFolders(a.userId);
  return withCors(req, NextResponse.json(out));
}

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#e33d4e'),
  parentId: z.string().uuid().nullable().optional(),
});

// POST stays session-only: folder creation is an app-UI action, not part of
// the extension's surface. Keeping it narrow preserves the existing auth
// boundary and reduces the CORS attack surface.
export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const raw = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  try {
    const f = await createFolder(a.userId, parsed.data);
    return NextResponse.json(f);
  } catch (err) {
    if (err instanceof FolderError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}

export function OPTIONS(req: Request) {
  return preflight(req);
}
