import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { noteTags, tags } from '../db/schema';

/**
 * Ensures every tag in `names` exists for the user, returning their ids.
 * Tags are lowercased + trimmed + de-duplicated.
 */
export async function upsertTagsByName(userId: string, names: string[]): Promise<string[]> {
  const clean = Array.from(
    new Set(
      names
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n.length > 0 && n.length <= 40),
    ),
  );
  if (clean.length === 0) return [];

  const existing = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.name, clean)));
  const have = new Set(existing.map((t) => t.name));
  const missing = clean.filter((n) => !have.has(n));

  if (missing.length > 0) {
    const inserted = await db
      .insert(tags)
      .values(missing.map((name) => ({ userId, name })))
      .returning({ id: tags.id, name: tags.name });
    existing.push(...inserted);
  }

  const byName = new Map(existing.map((t) => [t.name, t.id]));
  return clean.map((n) => byName.get(n)).filter((x): x is string => typeof x === 'string');
}

/** Replace the tag membership of a note with exactly `tagIds`. */
export async function setNoteTags(noteId: string, tagIds: string[]) {
  await db.delete(noteTags).where(eq(noteTags.noteId, noteId));
  if (tagIds.length > 0) {
    await db.insert(noteTags).values(tagIds.map((tagId) => ({ noteId, tagId })));
  }
}
