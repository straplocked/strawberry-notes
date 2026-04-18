import { NextResponse } from 'next/server';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { noteTags, notes, tags } from '@/lib/db/schema';
import type { TagDTO } from '@/lib/types';

export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`coalesce(count(${noteTags.noteId})::int, 0)`,
    })
    .from(tags)
    .leftJoin(noteTags, eq(noteTags.tagId, tags.id))
    .leftJoin(
      notes,
      and(eq(notes.id, noteTags.noteId), isNull(notes.trashedAt), eq(notes.userId, a.userId)),
    )
    .where(eq(tags.userId, a.userId))
    .groupBy(tags.id)
    .orderBy(desc(sql`count(${noteTags.noteId})`), asc(tags.name));

  const out: TagDTO[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count ?? 0),
  }));
  return NextResponse.json(out);
}
