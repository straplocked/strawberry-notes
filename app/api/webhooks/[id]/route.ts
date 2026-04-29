import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { deleteWebhook, isValidWebhookUrl, updateWebhook } from '@/lib/webhooks/service';
import { WEBHOOK_EVENTS } from '@/lib/webhooks/types';

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  url: z.string().min(1).max(2000).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  enabled: z.boolean().optional(),
  resetFailures: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;

  const raw = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (parsed.data.url !== undefined && !isValidWebhookUrl(parsed.data.url)) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const dto = await updateWebhook(a.userId, id, parsed.data);
  if (!dto) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(dto);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const ok = await deleteWebhook(a.userId, id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
