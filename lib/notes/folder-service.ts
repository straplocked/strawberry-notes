import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { folders, notes } from '../db/schema';
import type { FolderDTO } from '../types';

export async function listFolders(userId: string): Promise<FolderDTO[]> {
  const rows = await db
    .select({
      id: folders.id,
      parentId: folders.parentId,
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
    parentId: r.parentId,
    name: r.name,
    color: r.color,
    position: r.position,
    count: Number(r.count ?? 0),
  }));
}

export interface CreateFolderInput {
  name: string;
  color?: string;
  parentId?: string | null;
}

export class FolderError extends Error {
  constructor(public code: 'parent-not-found' | 'parent-cycle', message: string) {
    super(message);
  }
}

export async function createFolder(userId: string, input: CreateFolderInput): Promise<FolderDTO> {
  const parentId = input.parentId ?? null;
  if (parentId) {
    // Ownership check: a folder can only nest inside one of the same user's
    // folders. Without this an attacker with a session could plant a folder
    // under another user's tree.
    const [parent] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, parentId), eq(folders.userId, userId)));
    if (!parent) throw new FolderError('parent-not-found', 'parent folder not found');
  }

  const [maxPos] = await db
    .select({ max: sql<number>`coalesce(max(${folders.position}), -1)::int` })
    .from(folders)
    .where(eq(folders.userId, userId));

  const [f] = await db
    .insert(folders)
    .values({
      userId,
      parentId,
      name: input.name,
      color: input.color ?? '#e33d4e',
      position: Number(maxPos?.max ?? -1) + 1,
    })
    .returning();

  return {
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    color: f.color,
    position: f.position,
    count: 0,
  };
}

export interface UpdateFolderInput {
  name?: string;
  color?: string;
  position?: number;
  parentId?: string | null;
}

/**
 * Update a folder. Returns null if the folder doesn't exist or doesn't belong
 * to the user. Throws FolderError on a cycle (a folder cannot become a
 * descendant of itself) or when the new parent is missing / not the user's.
 */
export async function updateFolder(
  userId: string,
  id: string,
  patch: UpdateFolderInput,
): Promise<FolderDTO | null> {
  if (patch.parentId !== undefined) {
    await assertParentLegal(userId, id, patch.parentId);
  }

  const updates: Partial<typeof folders.$inferInsert> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.position !== undefined) updates.position = patch.position;
  if (patch.parentId !== undefined) updates.parentId = patch.parentId;

  const [updated] = await db
    .update(folders)
    .set(updates)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))
    .returning();

  if (!updated) return null;

  // The updated row has count=0 unless we re-aggregate; the caller (REST
  // PATCH handler) doesn't need the count, but the DTO contract demands it.
  // Re-query through listFolders to keep the shape consistent.
  const all = await listFolders(userId);
  return all.find((f) => f.id === id) ?? null;
}

async function assertParentLegal(
  userId: string,
  folderId: string,
  newParentId: string | null,
): Promise<void> {
  if (newParentId === null) return;
  if (newParentId === folderId) {
    throw new FolderError('parent-cycle', 'a folder cannot be its own parent');
  }
  // Walk up the chain from newParentId; if we ever hit folderId, this would
  // close a cycle. Folder trees in this app are tiny, so a per-step query is
  // cheaper than pulling the full table; cap the walk at a sane depth.
  let cursor: string | null = newParentId;
  for (let i = 0; i < 64 && cursor; i++) {
    const [row] = await db
      .select({ id: folders.id, parentId: folders.parentId })
      .from(folders)
      .where(and(eq(folders.id, cursor), eq(folders.userId, userId)));
    if (!row) {
      throw new FolderError('parent-not-found', 'parent folder not found');
    }
    if (row.id === folderId) {
      throw new FolderError(
        'parent-cycle',
        'cannot move a folder under one of its own descendants',
      );
    }
    cursor = row.parentId;
  }
}
