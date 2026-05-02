import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import {
  NotConfiguredError,
  updatePassphraseWrap,
  WrapBlobSchema,
} from '@/lib/notes/encryption-service';

const PatchBody = z.object({
  passphraseWrap: WrapBlobSchema,
});

/**
 * PATCH /api/private-notes/passphrase
 *
 * Replace the passphrase-wrap with a new one (the client unwrapped the NMK
 * with the old passphrase, derived a new KEK from the new passphrase, and
 * re-wrapped). The recovery wrap is untouched.
 *
 * Response:
 *   200 — `{ ok: true }`
 *   400 — invalid body.
 *   404 — not configured (call /setup first).
 *   401 — no session.
 */
export async function PATCH(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const raw = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    await updatePassphraseWrap(a.userId, parsed.data.passphraseWrap);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: 'not configured' }, { status: 404 });
    }
    throw err;
  }
}
