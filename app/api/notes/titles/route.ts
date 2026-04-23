import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, isNull } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';

/**
 * GET /api/notes/titles?q=<prefix>
 *
 * Lightweight typeahead endpoint used by the editor's `[[` autocomplete popup.
 * Returns at most 20 rows of `{ id, title }` for the signed-in user's live
 * (non-trashed) notes whose title matches the query, ordered by `updatedAt`
 * desc. A blank `q` returns the most recently updated notes.
 *
 * Separate from `GET /api/notes` because that endpoint pulls `snippet`,
 * `tagIds`, `hasImage` etc. — overkill for a keystroke-per-character popup.
 */
export async function GET(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  const conditions = [eq(notes.userId, a.userId), isNull(notes.trashedAt)];
  if (q.length > 0) {
    conditions.push(ilike(notes.title, `%${q}%`));
  }

  const rows = await db
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(and(...conditions))
    .orderBy(desc(notes.updatedAt))
    .limit(20);

  return NextResponse.json(rows);
}
