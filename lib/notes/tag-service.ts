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

export class TagError extends Error {
  constructor(public code: 'invalid-name' | 'not-found' | 'noop', message: string) {
    super(message);
  }
}

function cleanName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Rename a tag. If `newName` is already taken by another of the user's tags,
 * this performs a *merge*: every `note_tags` row pointing at the source tag
 * is rewritten to point at the existing one, and the source tag is deleted.
 *
 * Returns the surviving tag's id (which is the original id on a pure rename,
 * or the existing-target id on merge). Returns null if `id` doesn't belong
 * to the user.
 */
export async function renameTag(
  userId: string,
  id: string,
  newName: string,
): Promise<{ id: string; merged: boolean } | null> {
  const clean = cleanName(newName);
  if (!clean || clean.length > 40) {
    throw new TagError('invalid-name', 'name must be 1–40 characters');
  }

  const [source] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)));
  if (!source) return null;

  if (source.name === clean) {
    // Pure no-op — return success without touching the DB.
    return { id: source.id, merged: false };
  }

  // Does another tag already have this name?
  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, clean)));

  if (!existing) {
    // Simple rename.
    await db.update(tags).set({ name: clean }).where(eq(tags.id, id));
    return { id, merged: false };
  }

  // Merge into existing. Rewrite note_tags pointing at the source so they
  // point at the target. ON CONFLICT skips rows where (note_id, target_tag_id)
  // already exists — which is the merge invariant: if a note had both tags,
  // it ends up with just the target.
  //
  // We do this in a single SQL roundtrip via a CTE. Using a regular `update`
  // would leave duplicate-key errors on the (noteId, tagId) PK; the
  // delete-then-insert pattern with `ON CONFLICT DO NOTHING` is the
  // PostgreSQL-idiomatic merge.
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO ${noteTags} ("note_id", "tag_id")
      SELECT "note_id", ${existing.id}
      FROM ${noteTags}
      WHERE "tag_id" = ${id}
      ON CONFLICT DO NOTHING
    `);
    // Drop the source tag — cascade kills any remaining note_tags rows.
    await tx.delete(tags).where(eq(tags.id, id));
  });

  return { id: existing.id, merged: true };
}

/**
 * Delete a tag. All `note_tags` rows are cascade-removed; notes themselves
 * are untouched.
 */
export async function deleteTag(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning({ id: tags.id });
  return rows.length > 0;
}
