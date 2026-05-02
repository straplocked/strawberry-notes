import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { deleteNote, getNote, updateNote } from '@/lib/notes/service';
import type { NoteEncryption, PMDoc } from '@/lib/types';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const n = await getNote(a.userId, id);
  if (!n) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(n);
}

// `encryption: null` is the *explicit* private→plaintext transition signal;
// `undefined` (not present) means "no change to privacy state." Zod has no
// native way to keep `undefined` and `null` as distinct values when using
// `.optional().nullable()` — both collapse to "value may be missing." We
// solve it by reading the raw key existence on the JSON object after parse
// and threading the `null` separately. See the explicit `'encryption' in raw`
// check below.
const NoteEncryptionSchema = z.object({
  v: z.number().int().positive(),
  iv: z.string().min(1).max(64),
});

const PatchBody = z.object({
  title: z.string().max(300).optional(),
  content: z
    .object({
      type: z.literal('doc'),
      content: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .optional(),
  folderId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
  tagNames: z.array(z.string()).optional(),
  trashed: z.boolean().optional(),
  encryption: NoteEncryptionSchema.nullable().optional(),
  // Soft cap to avoid a 1 GB JSON body crashing the server while still
  // permitting genuine documents (notes are commonly < 64 KB; 4 MB allows
  // for huge markdown/lists/tables and still rejects abuse).
  ciphertext: z.string().max(4 * 1024 * 1024).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  // Distinguish "field absent" from "field explicitly null" — required for the
  // private→plaintext transition (`encryption: null` + `content: PMDoc`).
  const explicitlyNull =
    raw && typeof raw === 'object' && 'encryption' in raw && parsed.data.encryption === null;
  const encryptionPatch: NoteEncryption | null | undefined = explicitlyNull
    ? null
    : parsed.data.encryption ?? undefined;

  try {
    const fresh = await updateNote(a.userId, id, {
      title: parsed.data.title,
      content: parsed.data.content as unknown as PMDoc | undefined,
      folderId: parsed.data.folderId,
      pinned: parsed.data.pinned,
      tagNames: parsed.data.tagNames,
      trashed: parsed.data.trashed,
      encryption: encryptionPatch,
      ciphertext: parsed.data.ciphertext,
    });
    if (!fresh) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(fresh);
  } catch (err) {
    // Service layer throws `Error` for malformed encryption transitions
    // (e.g. ciphertext missing, plaintext PATCH on a private note). Surface
    // the message verbatim — the client built the payload, the client can
    // read the diagnostic.
    if (err instanceof Error && /encryption|ciphertext|private/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const ok = await deleteNote(a.userId, id, { hard: true });
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
