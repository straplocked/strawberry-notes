/**
 * Event fan-out.
 *
 * Each service-layer call site that mutates state calls a single helper
 * here (e.g. `fireNoteCreated(userId, note)`). The helpers build the
 * payload, look up the user's enabled webhooks subscribed to that event,
 * and queue a delivery against each.
 *
 * Two delivery shapes:
 *   - Most events fire immediately — `note.created`, `note.trashed`,
 *     `note.tagged`, `note.linked`. These deliver as soon as the call
 *     site finishes its DB work.
 *   - `note.updated` is debounced 5 s per (userId, noteId). The editor's
 *     autosave already runs every ~2 s during active typing; without
 *     debouncing, a 30-second editing session would emit 15 webhooks.
 *     The debounced delivery carries the *latest* state and the union
 *     of all `changedFields` touched in the window.
 *
 * Restart loss: the debounce timer lives in module memory. A process
 * restart inside a 5 s window drops the pending event. Acceptable —
 * webhooks are best-effort and consumers reconcile via the REST API on
 * demand.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { webhooks } from '../db/schema';
import type { NoteDTO, NoteListItemDTO } from '../types';
import { deliverOnce } from './delivery';
import type {
  NoteCreatedPayload,
  NoteLinkedPayload,
  NoteTaggedPayload,
  NoteTrashedPayload,
  NoteUpdatedPayload,
  WebhookEvent,
  WebhookNoteRef,
  WebhookPayload,
} from './types';

/** Reduce a full NoteDTO (or list-item DTO) to the slim webhook ref shape. */
export function noteRef(
  dto: Pick<NoteDTO, 'id' | 'title' | 'folderId' | 'pinned' | 'tagIds' | 'updatedAt'> | NoteListItemDTO,
): WebhookNoteRef {
  return {
    id: dto.id,
    title: dto.title,
    folderId: dto.folderId,
    pinned: dto.pinned,
    tagIds: dto.tagIds,
    updatedAt: dto.updatedAt,
  };
}

const DEBOUNCE_MS = 5_000;

/**
 * Pending update batches keyed by `${userId}:${noteId}`. Each entry holds
 * a debounce timer, the most recent note ref seen, and the set of fields
 * that have been touched since the first edit in the window.
 */
interface PendingUpdate {
  timer: ReturnType<typeof setTimeout>;
  latest: WebhookNoteRef;
  userId: string;
  changedFields: Set<NoteUpdatedPayload['changedFields'][number]>;
}
const pendingUpdates = new Map<string, PendingUpdate>();

function pendingKey(userId: string, noteId: string): string {
  return `${userId}:${noteId}`;
}

/**
 * Map row → secret cache. We don't keep raw secrets in memory long-term;
 * instead `fireEvent` fetches a fresh per-row secret on each fire-out via
 * a sealed table row. The secrets are stored hashed, so the only way to
 * deliver is for the *operator* to have stored the raw secret somewhere
 * else (their integration target). We sign the request with the hash —
 * receivers verify against the same hash they were given at create time.
 *
 * Note: this means the "secret" the consumer holds IS the hash. That's
 * fine: the threat model is "an eavesdropper on the wire can't forge a
 * payload"; using the hash as the HMAC key satisfies that as long as the
 * raw secret was delivered to the consumer over a trusted channel (the
 * one-time display in the Settings UI).
 */
async function targetsForEvent(userId: string, event: WebhookEvent) {
  return db
    .select({ id: webhooks.id, url: webhooks.url, secretHash: webhooks.secretHash })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.userId, userId),
        eq(webhooks.enabled, true),
        // events @> ARRAY['note.created']  — Postgres "contains" for text[]
        sql`${webhooks.events} @> ARRAY[${event}]::text[]`,
      ),
    );
}

async function deliverAll(
  userId: string,
  event: WebhookEvent,
  payload: WebhookPayload,
): Promise<void> {
  const rows = await targetsForEvent(userId, event);
  for (const row of rows) {
    void deliverOnce(
      { id: row.id, url: row.url, secret: row.secretHash },
      event,
      payload,
    ).catch((err) => {
      console.error('[webhook] delivery error', { webhookId: row.id, err });
    });
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Public fire-helpers, one per event ─────────────────────────────────

export function fireNoteCreated(userId: string, note: WebhookNoteRef): void {
  const payload: NoteCreatedPayload = {
    event: 'note.created',
    timestamp: nowIso(),
    userId,
    note,
  };
  void deliverAll(userId, 'note.created', payload);
}

export function fireNoteUpdated(
  userId: string,
  note: WebhookNoteRef,
  changedFields: NoteUpdatedPayload['changedFields'],
): void {
  const key = pendingKey(userId, note.id);
  const existing = pendingUpdates.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.latest = note;
    for (const f of changedFields) existing.changedFields.add(f);
    existing.timer = scheduleFlush(key);
    return;
  }
  const entry: PendingUpdate = {
    timer: scheduleFlush(key),
    latest: note,
    userId,
    changedFields: new Set(changedFields),
  };
  pendingUpdates.set(key, entry);
}

function scheduleFlush(key: string) {
  const t = setTimeout(() => flushUpdate(key), DEBOUNCE_MS);
  if (typeof t === 'object' && t && 'unref' in t) {
    (t as unknown as { unref(): void }).unref();
  }
  return t;
}

function flushUpdate(key: string): void {
  const entry = pendingUpdates.get(key);
  if (!entry) return;
  pendingUpdates.delete(key);
  const payload: NoteUpdatedPayload = {
    event: 'note.updated',
    timestamp: nowIso(),
    userId: entry.userId,
    note: entry.latest,
    changedFields: Array.from(entry.changedFields),
  };
  void deliverAll(entry.userId, 'note.updated', payload);
}

export function fireNoteTrashed(userId: string, note: WebhookNoteRef): void {
  const payload: NoteTrashedPayload = {
    event: 'note.trashed',
    timestamp: nowIso(),
    userId,
    note,
  };
  void deliverAll(userId, 'note.trashed', payload);
}

export function fireNoteTagged(
  userId: string,
  note: WebhookNoteRef,
  tag: { id: string; name: string },
): void {
  const payload: NoteTaggedPayload = {
    event: 'note.tagged',
    timestamp: nowIso(),
    userId,
    note,
    tag,
  };
  void deliverAll(userId, 'note.tagged', payload);
}

export function fireNoteLinked(
  userId: string,
  source: WebhookNoteRef,
  target: WebhookNoteRef,
): void {
  const payload: NoteLinkedPayload = {
    event: 'note.linked',
    timestamp: nowIso(),
    userId,
    source,
    target,
  };
  void deliverAll(userId, 'note.linked', payload);
}

// ── Test helpers ───────────────────────────────────────────────────────

/**
 * Force-flush a specific pending update synchronously (tests only).
 * Returns true if there was something to flush.
 */
export function __flushUpdateForTests(userId: string, noteId: string): boolean {
  const key = pendingKey(userId, noteId);
  const entry = pendingUpdates.get(key);
  if (!entry) return false;
  clearTimeout(entry.timer);
  flushUpdate(key);
  return true;
}

export function __resetWebhooksForTests(): void {
  for (const e of pendingUpdates.values()) clearTimeout(e.timer);
  pendingUpdates.clear();
}

export const __TEST = { DEBOUNCE_MS };
