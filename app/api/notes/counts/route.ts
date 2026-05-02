import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';
import type { NoteCountsDTO } from '@/lib/types';

/**
 * GET /api/notes/counts
 *
 * Top-level sidebar counts (All Notes / Pinned / Trash) computed authoritatively
 * in a single SQL query. The sidebar used to derive these from whichever notes
 * list was cached, which drifted depending on the active view.
 */
export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const [row] = await db
    .select({
      all: sql<number>`count(*) filter (where ${notes.trashedAt} is null)::int`,
      pinned: sql<number>`count(*) filter (where ${notes.trashedAt} is null and ${notes.pinned} = true)::int`,
      trash: sql<number>`count(*) filter (where ${notes.trashedAt} is not null)::int`,
      // `private` matches the sidebar row's filter exactly (live notes whose
      // body the user has marked Private). Backed by the partial
      // `notes_encryption_idx` from drizzle/0012_private_notes.sql, so the
      // FILTER cost is a tiny lookup even on workspaces with thousands of
      // plaintext notes.
      privateCount: sql<number>`count(*) filter (where ${notes.trashedAt} is null and ${notes.encryption} is not null)::int`,
    })
    .from(notes)
    .where(eq(notes.userId, a.userId));

  const out: NoteCountsDTO = {
    all: Number(row?.all ?? 0),
    pinned: Number(row?.pinned ?? 0),
    trash: Number(row?.trash ?? 0),
    private: Number(row?.privateCount ?? 0),
  };
  return NextResponse.json(out);
}
