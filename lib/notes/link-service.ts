import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { noteLinks, notes } from '../db/schema';
import { extractWikiLinks } from '../editor/prosemirror-utils';
import type { BacklinkDTO, PMDoc } from '../types';

/**
 * Replace the set of outbound `[[wiki-links]]` for a note.
 *
 * Given the note's ProseMirror doc, extract titles, resolve each to an existing
 * note id (scoped to the same user, case-insensitive title match), and store
 * the result in `note_links`. Unresolved titles are kept with `target_id=null`
 * so they auto-resolve later when a matching note is created via
 * {@link resolvePendingLinksForTitle}.
 */
export async function syncOutboundLinks(
  userId: string,
  sourceId: string,
  doc: PMDoc,
): Promise<void> {
  const titles = extractWikiLinks(doc);

  await db.transaction(async (tx) => {
    await tx.delete(noteLinks).where(eq(noteLinks.sourceId, sourceId));
    if (titles.length === 0) return;

    const matches = await tx
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          sql`lower(${notes.title}) in (${sql.join(
            titles.map((t) => sql`${t}`),
            sql`, `,
          )})`,
        ),
      );

    const byTitle = new Map<string, string>();
    for (const m of matches) byTitle.set(m.title.trim().toLowerCase(), m.id);

    const rows = titles.map((title) => ({
      sourceId,
      targetId: byTitle.get(title) ?? null,
      targetTitle: title,
    }));
    await tx.insert(noteLinks).values(rows).onConflictDoNothing();
  });
}

/**
 * When a note is created or renamed, any existing unresolved `note_links` rows
 * whose `target_title` matches (case-insensitive) should point at it. Scoped
 * to the owning user's notes — we dereference source notes to check ownership.
 */
export async function resolvePendingLinksForTitle(
  userId: string,
  noteId: string,
  title: string,
): Promise<void> {
  const t = title.trim().toLowerCase();
  if (!t) return;

  // Only update rows whose source note belongs to the same user. We can't
  // express this in a single UPDATE with Drizzle's type-narrow WHERE because
  // note_links has no userId column, so we use a correlated sub-select.
  await db
    .update(noteLinks)
    .set({ targetId: noteId })
    .where(
      and(
        eq(noteLinks.targetTitle, t),
        isNull(noteLinks.targetId),
        sql`exists (
          select 1 from ${notes}
          where ${notes.id} = ${noteLinks.sourceId}
            and ${notes.userId} = ${userId}
        )`,
      ),
    );
}

/**
 * When a note's title changes, prior targets of that old title on this note
 * should drop back to null so they can re-resolve (usually to something else,
 * or stay unresolved).
 */
export async function unresolveLinksTo(userId: string, noteId: string): Promise<void> {
  await db
    .update(noteLinks)
    .set({ targetId: null })
    .where(
      and(
        eq(noteLinks.targetId, noteId),
        sql`exists (
          select 1 from ${notes}
          where ${notes.id} = ${noteLinks.sourceId}
            and ${notes.userId} = ${userId}
        )`,
      ),
    );
}

/** List notes that link to the given target, newest-updated first. */
export async function listBacklinks(userId: string, noteId: string): Promise<BacklinkDTO[]> {
  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      snippet: notes.snippet,
      contentText: notes.contentText,
      updatedAt: notes.updatedAt,
    })
    .from(noteLinks)
    .innerJoin(notes, eq(notes.id, noteLinks.sourceId))
    .where(
      and(
        eq(noteLinks.targetId, noteId),
        eq(notes.userId, userId),
        isNull(notes.trashedAt),
      ),
    )
    .orderBy(desc(notes.updatedAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.snippet || r.contentText.slice(0, 180),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Batched backlink counts for a set of note ids. Useful for the note list UI —
 * avoids N+1 lookups when rendering a backlink badge per row.
 */
export async function backlinkCounts(
  userId: string,
  noteIds: string[],
): Promise<Record<string, number>> {
  if (noteIds.length === 0) return {};
  const rows = await db
    .select({
      targetId: noteLinks.targetId,
      n: sql<number>`count(*)::int`,
    })
    .from(noteLinks)
    .innerJoin(notes, eq(notes.id, noteLinks.sourceId))
    .where(
      and(
        inArray(noteLinks.targetId, noteIds),
        eq(notes.userId, userId),
        isNull(notes.trashedAt),
      ),
    )
    .groupBy(noteLinks.targetId);
  const out: Record<string, number> = {};
  for (const r of rows) if (r.targetId) out[r.targetId] = r.n;
  return out;
}
