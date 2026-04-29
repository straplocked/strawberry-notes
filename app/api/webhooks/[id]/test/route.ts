import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { webhooks } from '@/lib/db/schema';
import { deliverOnce } from '@/lib/webhooks/delivery';
import type { NoteCreatedPayload } from '@/lib/webhooks/types';

/**
 * POST /api/webhooks/:id/test
 *
 * Sends a synthetic `note.created` payload to the configured URL, ignoring
 * the webhook's `events` subscription. Useful for "does my consumer see
 * us?" without requiring an actual note edit. The result of the delivery
 * (status code, attempt count) is returned to the caller; the row's
 * lastSuccessAt / lastFailureAt are updated as if it were a real fire.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;

  const [row] = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      secretHash: webhooks.secretHash,
    })
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, a.userId)));
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const payload: NoteCreatedPayload = {
    event: 'note.created',
    timestamp: new Date().toISOString(),
    userId: a.userId,
    note: {
      id: '00000000-0000-0000-0000-000000000000',
      title: 'Strawberry Notes — webhook test',
      folderId: null,
      pinned: false,
      tagIds: [],
      updatedAt: new Date().toISOString(),
    },
  };

  const result = await deliverOnce(
    { id: row.id, url: row.url, secret: row.secretHash },
    'note.created',
    payload,
    { maxAttempts: 1 },
  );
  return NextResponse.json(result);
}
