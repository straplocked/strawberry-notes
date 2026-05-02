import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { webhooks } from '../db/schema';
import { notifyWebhookCreated } from '../email/notifications';
import { generateSecret, hashSecret } from './secret';
import { isWebhookEvent, type IssuedWebhook, type WebhookDTO, type WebhookEvent } from './types';

const NAME_MAX = 80;
const ERROR_MAX = 500;

function rowToDTO(row: typeof webhooks.$inferSelect): WebhookDTO {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: row.events.filter(isWebhookEvent),
    enabled: row.enabled,
    lastSuccessAt: row.lastSuccessAt ? row.lastSuccessAt.toISOString() : null,
    lastFailureAt: row.lastFailureAt ? row.lastFailureAt.toISOString() : null,
    lastErrorMessage: row.lastErrorMessage ?? null,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWebhooks(userId: string): Promise<WebhookDTO[]> {
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.userId, userId))
    .orderBy(desc(webhooks.createdAt));
  return rows.map(rowToDTO);
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: WebhookEvent[];
}

export interface CreateWebhookOpts {
  /** Base URL for the notification email link; usually `getPublicBaseUrl(req)`. */
  baseUrl?: string;
}

export async function createWebhook(
  userId: string,
  input: CreateWebhookInput,
  opts: CreateWebhookOpts = {},
): Promise<IssuedWebhook> {
  const secret = generateSecret();
  const [row] = await db
    .insert(webhooks)
    .values({
      userId,
      name: input.name.trim().slice(0, NAME_MAX) || 'webhook',
      url: input.url.trim(),
      secretHash: hashSecret(secret),
      events: input.events.filter(isWebhookEvent),
    })
    .returning();
  const dto = rowToDTO(row);
  void notifyWebhookCreated(userId, {
    webhookName: dto.name,
    webhookUrl: dto.url,
    events: dto.events,
    createdAt: row.createdAt,
    baseUrl: opts.baseUrl,
  });
  return { ...dto, secret };
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: WebhookEvent[];
  enabled?: boolean;
  /** When true, also clear consecutiveFailures + lastErrorMessage. */
  resetFailures?: boolean;
}

export async function updateWebhook(
  userId: string,
  id: string,
  patch: UpdateWebhookInput,
): Promise<WebhookDTO | null> {
  const updates: Partial<typeof webhooks.$inferInsert> = {};
  if (patch.name !== undefined) updates.name = patch.name.trim().slice(0, NAME_MAX) || 'webhook';
  if (patch.url !== undefined) updates.url = patch.url.trim();
  if (patch.events !== undefined) updates.events = patch.events.filter(isWebhookEvent);
  if (patch.enabled !== undefined) updates.enabled = patch.enabled;
  if (patch.resetFailures) {
    updates.consecutiveFailures = 0;
    updates.lastErrorMessage = null;
  }
  if (Object.keys(updates).length === 0) {
    // Treat a no-op patch as a touch — return current state.
    const [row] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)));
    return row ? rowToDTO(row) : null;
  }
  const [row] = await db
    .update(webhooks)
    .set(updates)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
    .returning();
  return row ? rowToDTO(row) : null;
}

export async function deleteWebhook(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
    .returning({ id: webhooks.id });
  return rows.length > 0;
}

/** Validate a URL is a plausible https/http endpoint. Used at create + patch. */
export function isValidWebhookUrl(raw: string): boolean {
  if (!raw || raw.length > 2000) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Truncate an error message to the schema-safe length. Exported for tests. */
export function truncateError(msg: string): string {
  return msg.slice(0, ERROR_MAX);
}
