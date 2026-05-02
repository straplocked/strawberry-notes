import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import {
  NotConfiguredError,
  updateRecoveryWrap,
  WrapBlobSchema,
} from '@/lib/notes/encryption-service';

const PostBody = z.object({
  recoveryWrap: WrapBlobSchema,
});

/**
 * POST /api/private-notes/recovery
 *
 * Replace the recovery-wrap with a new one. The new recovery code itself
 * never touches the server — the client generated it locally, derived a KEK
 * from it, wrapped the existing NMK, and shipped the wrap envelope.
 *
 * Response:
 *   200 — `{ ok: true }`
 *   400 — invalid body.
 *   404 — not configured (call /setup first).
 *   401 — no session.
 */
export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const raw = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    await updateRecoveryWrap(a.userId, parsed.data.recoveryWrap);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: 'not configured' }, { status: 404 });
    }
    throw err;
  }
}
