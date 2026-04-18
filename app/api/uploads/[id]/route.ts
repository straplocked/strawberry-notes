import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { attachments } from '@/lib/db/schema';
import { uploadsDir } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;

  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, a.userId)));
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const path = join(uploadsDir(), row.storagePath);
  try {
    const st = await stat(path);
    const stream = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
    return new Response(stream, {
      headers: {
        'content-type': row.mime,
        'content-length': String(st.size),
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'file missing' }, { status: 410 });
  }
}
