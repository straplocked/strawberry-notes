import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import {
  AlreadyConfiguredError,
  setupUserEncryption,
  WrapBlobSchema,
} from '@/lib/notes/encryption-service';

const SetupBody = z.object({
  passphraseWrap: WrapBlobSchema,
  recoveryWrap: WrapBlobSchema,
});

/**
 * POST /api/private-notes/setup
 *
 * One-shot setup. The client generates the Note Master Key, wraps it twice
 * (once with the passphrase-derived KEK, once with the recovery-code-derived
 * KEK), and posts the two envelopes here. The server stores them.
 *
 * Response:
 *   200 — material persisted, returns the same shape as GET /wrap.
 *   400 — invalid body shape.
 *   409 — already configured (use PATCH /passphrase to change passphrase, or
 *         POST /recovery to regenerate the recovery code).
 *   401 — no session.
 */
export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const raw = await req.json().catch(() => null);
  const parsed = SetupBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    const material = await setupUserEncryption(
      a.userId,
      parsed.data.passphraseWrap,
      parsed.data.recoveryWrap,
    );
    return NextResponse.json(material);
  } catch (err) {
    if (err instanceof AlreadyConfiguredError) {
      return NextResponse.json({ error: 'already configured' }, { status: 409 });
    }
    throw err;
  }
}
