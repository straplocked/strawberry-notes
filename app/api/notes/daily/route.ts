import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import { openOrCreateDailyNote } from '@/lib/notes/daily';

/**
 * POST /api/notes/daily
 *
 * Idempotent: returns the existing `Daily — YYYY-MM-DD` note for the signed-in
 * user if one is present (and not trashed), otherwise creates it under a
 * `Daily` folder (also created on first call). Response shape:
 *   { note: NoteDTO; created: boolean }
 */
export async function POST() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const out = await openOrCreateDailyNote(a.userId);
  return NextResponse.json(out);
}
