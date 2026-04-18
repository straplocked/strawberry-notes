import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { attachments } from '@/lib/db/schema';
import {
  ensureUploadsDir,
  extForMime,
  isAllowedMime,
  maxUploadBytes,
} from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
  }
  if (!isAllowedMime(file.type)) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 415 });
  }
  if (file.size > maxUploadBytes()) {
    return NextResponse.json({ error: 'file too large' }, { status: 413 });
  }

  const dir = await ensureUploadsDir();
  const id = randomUUID();
  const ext = extForMime(file.type);
  const filename = `${id}.${ext}`;
  const path = join(dir, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path, buf);

  await db.insert(attachments).values({
    id,
    userId: a.userId,
    filename: file.name || filename,
    mime: file.type,
    size: file.size,
    storagePath: filename,
  });

  return NextResponse.json({ id, url: `/api/uploads/${id}` });
}
