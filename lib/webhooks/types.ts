/**
 * Outbound webhook event vocabulary.
 *
 * The five Tier 1 events are state transitions the existing service layer
 * already performs. Each is a single `fireEvent(...)` call at a site that
 * already mutates state — no new event bus, no pub/sub abstraction.
 *
 * Adding a sixth event is fine when the use case demands it; the
 * machinery here generalises trivially. What we are NOT doing in v1.4 is
 * an open-ended, plugin-style event surface — every event we ship has to
 * have a concrete integration story behind it.
 */

export const WEBHOOK_EVENTS = [
  'note.created',
  'note.updated',
  'note.trashed',
  'note.tagged',
  'note.linked',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/** Minimal note shape included in every note-scoped event payload. */
export interface WebhookNoteRef {
  id: string;
  title: string;
  folderId: string | null;
  pinned: boolean;
  tagIds: string[];
  updatedAt: string;
}

/** Per-event payload shapes. */
export interface NoteCreatedPayload {
  event: 'note.created';
  timestamp: string;
  userId: string;
  note: WebhookNoteRef;
}

export interface NoteUpdatedPayload {
  event: 'note.updated';
  timestamp: string;
  userId: string;
  note: WebhookNoteRef;
  /**
   * Which top-level fields changed in this debounced window. The webhook
   * receives the union of all fields touched between the first edit and
   * the 5-second quiescence that fires the event.
   */
  changedFields: Array<'title' | 'content' | 'folderId' | 'pinned' | 'tags'>;
}

export interface NoteTrashedPayload {
  event: 'note.trashed';
  timestamp: string;
  userId: string;
  note: WebhookNoteRef;
}

export interface NoteTaggedPayload {
  event: 'note.tagged';
  timestamp: string;
  userId: string;
  note: WebhookNoteRef;
  tag: { id: string; name: string };
}

export interface NoteLinkedPayload {
  event: 'note.linked';
  timestamp: string;
  userId: string;
  source: WebhookNoteRef;
  target: WebhookNoteRef;
}

export type WebhookPayload =
  | NoteCreatedPayload
  | NoteUpdatedPayload
  | NoteTrashedPayload
  | NoteTaggedPayload
  | NoteLinkedPayload;

/** DTO returned by `/api/webhooks` (no secret, suitable for the UI). */
export interface WebhookDTO {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  createdAt: string;
}

/** Returned ONCE on POST /api/webhooks — `secret` is never persisted in plaintext. */
export interface IssuedWebhook extends WebhookDTO {
  secret: string;
}
