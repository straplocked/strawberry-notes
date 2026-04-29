import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { rateLimit, rateLimitResponse } from '@/lib/http/rate-limit';
import { createWebhook, isValidWebhookUrl, listWebhooks } from '@/lib/webhooks/service';
import { WEBHOOK_EVENTS } from '@/lib/webhooks/types';

export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const list = await listWebhooks(a.userId);
  return NextResponse.json(list);
}

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  url: z.string().min(1).max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

// 20 webhook creates per user per hour. Same envelope as token mints —
// these are config operations, not hot paths.
const WEBHOOK_LIMIT = { capacity: 20, refillPerSec: 20 / 3600 };

export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const limit = rateLimit(`webhooks:${a.userId}`, WEBHOOK_LIMIT);
  if (!limit.ok) return rateLimitResponse(limit);

  const raw = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!isValidWebhookUrl(parsed.data.url)) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
  }

  const issued = await createWebhook(a.userId, parsed.data);
  // The raw `secret` is returned ONCE; only the SHA-256 hash is retained.
  return NextResponse.json(issued);
}
