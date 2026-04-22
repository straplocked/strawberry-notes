import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { folders, notes } from '../db/schema';
import type { FolderDTO } from '../types';

export async function listFolders(userId: string): Promise<FolderDTO[]> {
  const rows = await db
    .select({
      id: folders.id,
      name: folders.name,
      color: folders.color,
      position: folders.position,
      count: sql<number>`coalesce(count(${notes.id})::int, 0)`,
    })
    .from(folders)
    .leftJoin(
      notes,
      and(eq(notes.folderId, folders.id), isNull(notes.trashedAt), eq(notes.userId, userId)),
    )
    .where(eq(folders.userId, userId))
    .groupBy(folders.id)
    .orderBy(asc(folders.position), asc(folders.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    count: Number(r.count ?? 0),
  }));
}

export interface CreateFolderInput {
  name: string;
  color?: string;
}

export async function createFolder(userId: string, input: CreateFolderInput): Promise<FolderDTO> {
  const [maxPos] = await db
    .select({ max: sql<number>`coalesce(max(${folders.position}), -1)::int` })
    .from(folders)
    .where(eq(folders.userId, userId));

  const [f] = await db
    .insert(folders)
    .values({
      userId,
      name: input.name,
      color: input.color ?? '#e33d4e',
      position: Number(maxPos?.max ?? -1) + 1,
    })
    .returning();

  return {
    id: f.id,
    name: f.name,
    color: f.color,
    position: f.position,
    count: 0,
  };
}
