import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import {
  NOTIFICATION_KINDS,
  getEmailPreferences,
  setEmailPreferences,
} from '@/lib/email/preferences';

export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const prefs = await getEmailPreferences(a.userId);
  return NextResponse.json(prefs);
}

const PatchBody = z
  .object({
    passwordChanged: z.boolean().optional(),
    tokenCreated: z.boolean().optional(),
    webhookCreated: z.boolean().optional(),
    webhookDeadLetter: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty_patch' });

export async function PATCH(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const raw = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Defensive: drop any keys not in NOTIFICATION_KINDS (zod already
  // narrows shape, but the schema source of truth lives in preferences.ts).
  const cleaned: Partial<Record<(typeof NOTIFICATION_KINDS)[number], boolean>> = {};
  for (const k of NOTIFICATION_KINDS) {
    if (typeof parsed.data[k] === 'boolean') cleaned[k] = parsed.data[k];
  }
  const updated = await setEmailPreferences(a.userId, cleaned);
  return NextResponse.json(updated);
}
