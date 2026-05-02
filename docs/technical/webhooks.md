# Webhooks

[← Technical TOC](README.md)

Outbound webhooks let an integration (n8n, Zapier, Slack, a custom script — anything that can receive an HTTPS POST) react to changes in a user's notes without polling. Five lightweight events, fired from the same service-layer call sites that already mutate state. No new event bus, no pub/sub abstraction.

This is the v1.4 Tier 1.1 feature; see [../leadership/roadmap.md](../leadership/roadmap.md#v14--platform-readiness-planned) for context.

---

## Event catalogue

| Event           | When it fires                                                                              | Payload extras                                                  |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `note.created`  | A note is created via REST or MCP. Excludes the auto-seeded Welcome note (`first-run.ts`). | `note: WebhookNoteRef`                                          |
| `note.updated`  | Title / content / folder / pinned / tags changed. **Debounced 5 s per (user, note).**      | `note: WebhookNoteRef`, `changedFields: Array<...>`             |
| `note.trashed`  | A note is soft-deleted (moved to Trash). Hard-delete does not fire.                        | `note: WebhookNoteRef`                                          |
| `note.tagged`   | A tag is added to a note via the `add_tag` MCP tool or `POST /api/notes/:id/tags`. Idempotent. | `note: WebhookNoteRef`, `tag: { id, name }`                |
| `note.linked`   | A `[[wiki-link]]` *resolves* to an existing note for the first time.                       | `source: WebhookNoteRef`, `target: WebhookNoteRef`              |

`WebhookNoteRef` is the slim shape `{ id, title, folderId, pinned, tagIds, updatedAt }`. Consumers wanting the full body call back via `GET /api/notes/:id` with their personal access token.

### Why these five and not more

- **`note.tagged` is asymmetric.** No `note.untagged`. Integrations almost always care about *gaining* a label ("post to Slack when something becomes #blog"); losing one is rarely actionable.
- **`note.linked` only fires on first resolve.** A re-save with no link changes is silent. A title rename that re-resolves a previously-unresolved `[[Title]]` does fire. The `(source, target)` ordering is "which note holds the `[[…]]`" → "which note it points at". **Private Notes** (see [private-notes.md](private-notes.md)) cannot be link sources — server-side wiki-link extraction is skipped on every private write — so `note.linked(source=<private>, ...)` never fires. A *plaintext* note linking to a private one's title resolves and fires normally; the title stays plaintext.
- **No `note.purged` (hard-delete).** Hard-delete is rare and operator-driven. If an integration needs to garbage-collect mirrored state when a note is gone, polling the trash view is sufficient.
- **No scheduled events.** `digest.daily` and similar would require a scheduler — deferred to v1.4+ as "inbound triggers / scheduled events" on the candidate list. Outbound first; inbound on demand.

---

## Delivery model

### Request shape

```
POST <webhook.url>
Content-Type: application/json
User-Agent: Strawberry-Notes-Webhook/1.0
X-Strawberry-Event: note.created
X-Strawberry-Webhook-Id: <uuid>
X-Strawberry-Signature: sha256=<hex>

{
  "event": "note.created",
  "timestamp": "2026-04-29T01:23:45.678Z",
  "userId": "<uuid>",
  "note": { "id": "...", "title": "...", "folderId": null, "pinned": false, "tagIds": [], "updatedAt": "..." }
}
```

### Verification (consumer side)

Compute `HMAC-SHA-256(secret, body)` over the **raw request body** (not a re-stringified JSON; use Express's `express.raw({ type: 'application/json' })` or equivalent). Compare against the hex following `sha256=` in `X-Strawberry-Signature`. Reject on mismatch.

The secret is shown to the operator **once** at create time (`POST /api/webhooks`). Treat it like a password — it's never recoverable from the server.

### Retries + dead-letter

- 5 attempts per fire, exponential backoff: `1s, 2s, 4s, 8s` between attempts.
- 10-second per-attempt timeout.
- 4xx → no retry; the consumer is rejecting the payload, more attempts won't help. Counts as a failure for dead-letter.
- 5xx + network error → retry until `MAX_ATTEMPTS`.
- After **5 consecutive failures** (across fires, not within a single fire), the webhook auto-disables (`enabled = false`). The Settings UI surfaces this with a red status dot and the last error message.
- Re-enabling: `PATCH /api/webhooks/:id { "enabled": true, "resetFailures": true }` — or click **Enable** in Settings. The failure counter is cleared so dead-letter starts fresh.

### Restart-loss

The 5-second `note.updated` debounce timer lives in module memory. A process restart inside the window drops the pending event. This is the documented trade-off — webhooks are best-effort and consumers reconcile via the REST API on demand.

---

## Implementation map

| File                                    | Role                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `lib/webhooks/types.ts`                 | Event names + payload TypeScript shapes (single source of truth).       |
| `lib/webhooks/secret.ts`                | `whsec_…` generation, SHA-256 hashing, HMAC signing.                    |
| `lib/webhooks/service.ts`               | CRUD, URL validation, error truncation.                                 |
| `lib/webhooks/delivery.ts`              | Per-attempt POST, retry + backoff, success/failure DB writes.           |
| `lib/webhooks/fire.ts`                  | Public `fireNote*` helpers, fan-out to subscribed targets, debounce.    |
| `app/api/webhooks/route.ts`             | `GET` / `POST` (mint, rate-limited).                                    |
| `app/api/webhooks/[id]/route.ts`        | `PATCH` / `DELETE`.                                                     |
| `app/api/webhooks/[id]/test/route.ts`   | `POST` — synthetic `note.created` for smoke-testing from Settings.      |
| `components/app/settings/WebhooksSection.tsx` | The Settings panel. List, add, test, disable, delete.             |

`fireNote*` helpers are called from `lib/notes/service.ts` (note CRUD + `addTagToNote`) and indirectly from `lib/notes/link-service.ts` via the `(sourceId, targetId)` diff that `syncOutboundLinks` and `resolvePendingLinksForTitle` now return.

---

## Operator notes

- The webhook table (`drizzle/0008_webhooks.sql`) is per-user. Deleting a user cascades to their webhooks.
- There is no admin-level "all webhooks across all users" view. Operators run `psql` against the `webhooks` table if they need it.
- Outbound HTTP traffic from the app container is unrestricted by default — be careful pointing webhooks at internal addresses on a hostile multi-tenant host. If you want to lock this down, layer a network policy at the proxy/firewall.
