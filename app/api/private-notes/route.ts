import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import {
  countPrivateNotes,
  disableUserEncryption,
  getUserEncryptionMaterial,
  HasPrivateNotesError,
} from '@/lib/notes/encryption-service';

/**
 * GET /api/private-notes
 *
 * Lightweight status endpoint for the Settings panel: tells the client
 * whether Private Notes is configured and how many private notes exist.
 * Returns the wrap material itself only via /wrap (deliberate split — the
 * settings UI doesn't need the wrap blobs to render the on/off banner).
 *
 * Response:
 *   200 — `{ configured: boolean, privateCount: number }`
 */
export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const material = await getUserEncryptionMaterial(a.userId);
  const privateCount = await countPrivateNotes(a.userId);
  return NextResponse.json({
    configured: material !== null,
    privateCount,
  });
}

/**
 * DELETE /api/private-notes
 *
 * Disable Private Notes entirely. Refuses with 409 when the user still has
 * any private notes — the only material that could ever decrypt them is
 * about to be destroyed, so the client must first migrate them back to
 * plaintext (one by one, via the editor's lock toggle).
 *
 * Response:
 *   200 — `{ ok: true }` (also returns ok when not configured; idempotent)
 *   409 — `{ error, privateCount }` migration required first.
 */
export async function DELETE() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  try {
    await disableUserEncryption(a.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof HasPrivateNotesError) {
      return NextResponse.json(
        { error: 'has private notes', privateCount: err.count },
        { status: 409 },
      );
    }
    throw err;
  }
}
