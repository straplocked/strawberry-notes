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
 *
 * Returns the set of `(sourceId, targetId)` pairs that are *newly resolved*
 * by this sync — i.e. links that didn't exist (or weren't resolved) before.
 * Used by the service layer to fire `note.linked` webhooks. A re-save with
 * no actual link changes returns an empty array.
 */
export async function syncOutboundLinks(
  userId: string,
  sourceId: string,
  doc: PMDoc,
): Promise<Array<{ sourceId: string; targetId: string }>> {
  const titles = extractWikiLinks(doc);

  return db.transaction(async (tx) => {
    // Capture the previous resolved set so we can diff after the rewrite.
    const previous = await tx
      .select({ targetId: noteLinks.targetId })
      .from(noteLinks)
      .where(eq(noteLinks.sourceId, sourceId));
    const previouslyResolved = new Set(
      previous.map((p) => p.targetId).filter((x): x is string => typeof x === 'string'),
    );

    await tx.delete(noteLinks).where(eq(noteLinks.sourceId, sourceId));
    if (titles.length === 0) return [];

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

    // Newly-resolved = resolved-now AND NOT resolved-before.
    const newlyResolved: Array<{ sourceId: string; targetId: string }> = [];
    for (const r of rows) {
      if (r.targetId && !previouslyResolved.has(r.targetId)) {
        newlyResolved.push({ sourceId, targetId: r.targetId });
      }
    }
    return newlyResolved;
  });
}

/**
 * When a note is created or renamed, any existing unresolved `note_links` rows
 * whose `target_title` matches (case-insensitive) should point at it. Scoped
 * to the owning user's notes — we dereference source notes to check ownership.
 *
 * Returns the set of source note ids whose link to `noteId` just resolved —
 * the service layer fires `note.linked(source, target)` for each.
 */
export async function resolvePendingLinksForTitle(
  userId: string,
  noteId: string,
  title: string,
): Promise<string[]> {
  const t = title.trim().toLowerCase();
  if (!t) return [];

  // Only update rows whose source note belongs to the same user. We can't
  // express this in a single UPDATE with Drizzle's type-narrow WHERE because
  // note_links has no userId column, so we use a correlated sub-select.
  const updated = await db
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
    )
    .returning({ sourceId: noteLinks.sourceId });
  return updated.map((r) => r.sourceId);
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

export interface ListBacklinksOptions {
  /**
   * Defaults to `true`. When `false` (bearer callers via MCP / web clipper),
   * refuse to return backlinks of a private target — returning them would
   * confirm the existence of a private note at the supplied id, which is
   * something we hide from bearer callers everywhere else (`getNote`,
   * `listNotes`). Plaintext sources are filtered as a separate guard since
   * a private note can never *be* a backlink source (extraction is skipped),
   * but defence-in-depth costs nothing here.
   */
  includePrivate?: boolean;
}

/** List notes that link to the given target, newest-updated first. */
export async function listBacklinks(
  userId: string,
  noteId: string,
  opts: ListBacklinksOptions = {},
): Promise<BacklinkDTO[]> {
  const includePrivate = opts.includePrivate ?? true;

  if (!includePrivate) {
    // Cheap guard: refuse to surface backlinks when the target itself is
    // private. Mirrors the `getNote(includePrivate: false)` 404 behaviour.
    const [target] = await db
      .select({ encryption: notes.encryption })
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
    if (!target || target.encryption !== null) return [];
  }

  const conditions = [
    eq(noteLinks.targetId, noteId),
    eq(notes.userId, userId),
    isNull(notes.trashedAt),
  ];
  if (!includePrivate) {
    conditions.push(isNull(notes.encryption));
  }

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
    .where(and(...conditions))
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
