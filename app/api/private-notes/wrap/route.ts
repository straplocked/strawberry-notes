import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import { getUserEncryptionMaterial } from '@/lib/notes/encryption-service';

/**
 * GET /api/private-notes/wrap
 *
 * Returns the user's wrapped Note Master Key envelopes (passphrase + recovery)
 * plus the KDF parameters needed to derive the unwrapping KEK in the browser.
 * The unwrap operation itself happens entirely client-side; the server just
 * stores the bytes.
 *
 * Response:
 *   200 — `{ version, passphraseWrap, recoveryWrap, createdAt, updatedAt }`
 *   404 — Private Notes not configured for this user yet.
 *   401 — No session.
 */
export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const material = await getUserEncryptionMaterial(a.userId);
  if (!material) return NextResponse.json({ error: 'not configured' }, { status: 404 });
  return NextResponse.json(material);
}
