import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { noteTags, notes, tags } from '../db/schema';
import type { TagDTO } from '../types';

export async function listTags(userId: string): Promise<TagDTO[]> {
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
      and(eq(notes.id, noteTags.noteId), isNull(notes.trashedAt), eq(notes.userId, userId)),
    )
    .where(eq(tags.userId, userId))
    .groupBy(tags.id)
    .orderBy(desc(sql`count(${noteTags.noteId})`), asc(tags.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count ?? 0),
  }));
}
