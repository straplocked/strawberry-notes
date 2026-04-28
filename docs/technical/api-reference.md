# API Reference

[← Technical TOC](README.md)

Every endpoint lives under `app/api/`. With one exception (the signup endpoint), every handler starts with `requireUserId()` (see `lib/auth/require.ts`) and scopes every DB query to that user.

- **Content type:** `application/json` on both sides unless stated otherwise.
- **Auth:** Auth.js session cookie. An unauthenticated request to a protected route returns `401`.
- **Error shape:** `{ error: string }` with an appropriate HTTP status.

---

## Auth

### `POST /api/auth/signup`

Creates a new user and signs them in on the next client call.

Request:
```json
{ "email": "user@example.com", "password": "at-least-8-chars" }
```

- Validates email format and password length (≥ 8).
- Hashes with `bcryptjs` (cost 10).
- Inserts the `users` row, a default `Journal` folder, and a `Welcome to Strawberry Notes` note (via `lib/auth/first-run.ts`).
- Disabled when `ALLOW_PUBLIC_SIGNUP` is unset / falsy — returns `404` so the route doesn't advertise itself.

Responses:
- `200` `{ ok: true, userId }`
- `400` on validation failure
- `409` if email already exists

The client then calls `signIn('credentials', ...)` on success.

### `GET|POST /api/auth/[...nextauth]`

Auth.js catch-all. Delegates to `handlers` exported from `lib/auth.ts`. Supports credentials sign-in, session introspection, and sign-out. See [auth.md](auth.md).

---

## Notes

### `GET /api/notes`

List notes for the current user.

Query params:

| Param     | Values                                                                              | Meaning                                                          |
| --------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `folder`  | `all` \| `pinned` \| `trash` \| `today` \| `yesterday` \| `past7` \| `past30` \| `<uuid>` | Which view. Default `all`. Time tokens filter by `updatedAt`. |
| `tag`     | `<uuid>`                                                                            | Filter to notes that carry this tag.                             |
| `q`       | string                                                                              | FTS query over title + `contentText` (websearch).                |

- Excludes soft-deleted notes except when `folder=trash`.
- Orders by `updatedAt DESC` (pinned view: `pinned DESC, updatedAt DESC`).
- Hard-capped at **500 items**.

Time-range tokens (server-local):

| Token       | Window                                                           |
| ----------- | ---------------------------------------------------------------- |
| `today`     | Notes updated since 00:00:00 of the host's current calendar day. |
| `yesterday` | Notes updated within the prior calendar day (00:00 → 24:00).     |
| `past7`     | Rolling 7×24h window: `updatedAt >= now() - 7 days`.             |
| `past30`    | Rolling 30×24h window: `updatedAt >= now() - 30 days`.           |

Implementation lives in `lib/notes/time-range.ts` and is shared with the MCP `list_notes` tool.

Response: `NoteListItemDTO[]` (see `lib/types.ts`).

### `POST /api/notes`

Create a new note.

Request:
```json
{
  "title": "optional",
  "folderId": "<uuid>|null",
  "tagNames": ["optional", "array"]
}
```

Response: `{ id }` of the new note. Content is initialised to an empty ProseMirror doc.

### `GET /api/notes/:id`

Full note (`NoteDTO`) including `content` (PM JSON).

### `PATCH /api/notes/:id`

Partial update. Any of these fields may be present:

| Field      | Type                | Effect                                                             |
| ---------- | ------------------- | ------------------------------------------------------------------ |
| `title`    | string              | Rename.                                                            |
| `content`  | ProseMirror doc     | Overwrites `content`. Server recomputes `contentText` from it.     |
| `folderId` | uuid \| null        | Move between folders (null = no folder).                           |
| `pinned`   | boolean             | Pin / unpin.                                                       |
| `trashed`  | boolean             | `true` → sets `trashedAt = now()`. `false` → clears.               |
| `tagNames` | string[]            | Replaces the note's tags (upserts per-user by normalised name).    |

Response: updated `NoteDTO`.

### `DELETE /api/notes/:id`

Hard delete. Cascades remove `note_tags` rows; `attachments.noteId` is set to NULL.

### `GET /api/notes/:id/backlinks`

Returns the list of notes that link to this one via a `[[Title]]` wiki-link.
Implementation: joins `note_links.target_id = :id` with `notes` scoped to the
current user, newest-updated first, soft-deleted excluded.

Response: `BacklinkDTO[]` (`id`, `title`, `snippet`, `updatedAt`). Capped at 200 rows.
Empty array is normal when nothing links here.

### `GET /api/notes/titles?q=<prefix>`

Lightweight typeahead used by the editor's `[[` autocomplete popup. Returns up
to 20 `{id, title}` rows for the current user's live (non-trashed) notes whose
title matches `q` (case-insensitive substring). Blank `q` returns the most
recently updated 20. Backed by a `pg_trgm` GIN index on `notes.title`
(`drizzle/0006_title_trgm.sql`); the planner picks it up automatically once
the row count makes the trigram lookup faster than a sequential scan.

### `POST /api/notes/search/semantic`

Semantic (meaning-based) search over the current user's notes. Requires the
embedding provider to be configured (see [deployment.md](deployment.md)); returns
`503 { error: "semantic search not configured" }` otherwise.

Request:
```json
{ "query": "what did I decide about pricing", "k": 10 }
```

`k` defaults to 10, clamped to 50. Auth accepts either the session cookie or
`Authorization: Bearer <snb_...>`.

Response: array of the usual `NoteListItemDTO` shape with an extra `score` field
(cosine similarity in `[0, 1]`). Ranking is ANN via pgvector's IVFFlat index on
`notes.content_embedding`; the WHERE still filters by `userId` so cross-user
neighbours are impossible.

### `GET /api/notes/:id/export.md`

Returns the note serialised to Markdown (via `lib/markdown/to-markdown.ts`) as an attachment download. Filename is a slug of the title.

Headers:
- `content-type: text/markdown; charset=utf-8`
- `content-disposition: attachment; filename="<slug>.md"`

### `POST /api/notes/import`

Import Markdown. Accepts two shapes, picked by the `Content-Type` header:

**`multipart/form-data`** with one or more `files[]` entries (each a `.md`).
Per file: first `# H1` becomes the title (or filename if absent); body
parsed via `lib/markdown/from-markdown.ts`; inserted against the current
user, in no folder. Response: `{ imported: N, ids: <uuid>[] }`.

**`application/json`** with a single Markdown blob:

```json
{
  "markdown": "…",
  "title": "optional (≤300 chars)",
  "folderId": "<uuid>|null",
  "tagNames": ["optional"],
  "sourceUrl": "optional https://… — prepended as a blockquote"
}
```

Used by the browser web-clipper extension (`extension/`). Response:
`{ imported: 1, ids: [<uuid>], id: <uuid> }`.

Auth: accepts either the session cookie or `Authorization: Bearer <snb_...>`.
Responds to `OPTIONS` (CORS preflight).

### `GET /api/export/all.zip`

Streams every note and referenced attachment for the current user as a single
zip. Used for full backups; symmetric with `POST /api/notes/import` (manifest
lists every note's zip-relative path).

Query params:

| Param          | Values    | Meaning                                   |
| -------------- | --------- | ----------------------------------------- |
| `includeTrash` | `1`       | Include soft-deleted notes in the export. |

Archive layout:

```
manifest.json                                     — notes[] + attachments[] with paths
notes/<safeFolderName>/<safeTitle>-<shortId>.md   — YAML frontmatter + Markdown body
uploads/<safeName>-<shortId>.<ext>                — raw bytes of every referenced image
```

Notes outside a folder go under `notes/_unfiled/`. Frontmatter fields: `id`,
`title`, `folderId`, `pinned`, `tagNames`, `createdAt`, `updatedAt`,
`trashedAt`. Rendered Markdown is produced by `lib/markdown/to-markdown.ts`
(the same renderer used by per-note export).

Headers:
- `content-type: application/zip`
- `content-disposition: attachment; filename="strawberry-notes-<iso>.zip"`
- `cache-control: no-store`

The archive is produced with a hand-rolled streaming writer
(`lib/zip/streaming.ts`) — the whole archive is never buffered in memory.
Individual entries are capped at 4 GiB (non-zip64); single-user workspaces
are nowhere near that in practice.

---

## Folders

### `GET /api/folders`

All folders for the user, ordered by `position ASC`. Each includes a `count` of non-trashed notes.

Auth: accepts either the session cookie or `Authorization: Bearer <snb_...>`
(so the web-clipper extension can populate a target-folder dropdown).
Responds to `OPTIONS` (CORS preflight). `POST` remains session-only.

### `POST /api/folders`

Request:
```json
{ "name": "My folder", "color": "#e33d4e", "parentId": "<uuid>|null" }
```

`color` defaults to `#e33d4e` (strawberry accent) if omitted. `parentId`
nests the new folder under another (must belong to the same user); omit or
pass `null` for a top-level folder. Returns the new `FolderDTO`.

Errors: `400 { error: "parent-not-found" }` if `parentId` doesn't resolve to one
of the user's folders.

### `PATCH /api/folders/:id`

Partial update: `name`, `color`, `position`, `parentId`.

Setting `parentId` reparents the folder. The server walks the proposed
parent's ancestor chain and rejects the change with `400 { error: "parent-cycle" }`
if it would close a cycle (a folder cannot be moved under one of its own
descendants). Pass `parentId: null` to lift the folder back to the top
level.

### `DELETE /api/folders/:id`

Deletes the folder **and the entire subtree of nested folders below it**
(via the self-FK's `ON DELETE CASCADE`). Notes inside any of the deleted
folders survive with `folderId = NULL` (they appear under "All notes").

---

## Tags

### `GET /api/tags`

All tags for the user, each with a `count` of associated non-trashed notes. Ordered `count DESC, name ASC`.

Tags are created implicitly via `PATCH /api/notes/:id` with `tagNames`. There is no direct tag-create endpoint in v1.

### `PATCH /api/tags/:id`

Rename or merge a tag.

Request:
```json
{ "name": "new-name" }
```

The new name is normalised (trimmed + lowercased + ≤40 chars). Behaviour:

- If no other tag of the user has the new name, the row is renamed in place.
- If the new name collides with an existing tag, the two are **merged**:
  every `note_tags` row pointing at the source tag is rewritten to the
  existing one (`INSERT … ON CONFLICT DO NOTHING` handles notes that
  already had both), then the source row is dropped.

Response: `{ "id": "<surviving-tag-uuid>", "merged": <bool> }` — `id` equals
the original on a pure rename and the existing target's id on a merge;
`merged` flags which path ran. Errors: `400 { error: "invalid-name" }`,
`404` if the id doesn't belong to the user.

### `DELETE /api/tags/:id`

Delete a tag. Cascade removes every `note_tags` row that referenced it; the
notes themselves are untouched. Returns `{ ok: true }` or `404`.

---

## Uploads

### `POST /api/uploads`

Request: `multipart/form-data` with a single `file` field.

Rules (enforced in `lib/storage.ts`):
- MIME must be one of: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `image/avif`.
- Size ≤ `MAX_UPLOAD_MB` (default 10 MB).

On success:
- UUID filename assigned (`<uuid>.<ext>`) under `UPLOAD_DIR`.
- `attachments` row inserted with `userId`, `mime`, `size`, `storagePath`.
- Returns `{ id, url: "/api/uploads/<id>" }`.

Errors: `400` (no file), `413` (too big), `415` (wrong MIME), `401` (no session).

### `GET /api/uploads/:id`

Streams the attachment back.

- Verifies `attachments.userId === session.user.id` before touching the disk.
- `content-type` comes from the stored `mime`.
- `cache-control: private, max-age=3600`.
- `404` if the DB row exists but the file is missing on disk.

### `POST /api/attachments/gc`

Sweep orphaned attachments for the current user. An attachment is orphaned if
`noteId IS NULL` (never attached, or its note was hard-deleted before the
attachment-file cleanup existed) *and it is older than 5 minutes* — the grace
window keeps freshly-uploaded-but-not-yet-saved files safe from the sweep.
Rows whose referenced note no longer exists are also swept. Files are unlinked
from disk (with a path-containment check that refuses to touch anything
outside `UPLOAD_DIR`) and DB rows are deleted.

Hard-deleting a note now also cleans up its attachments inline, so this
endpoint is primarily a **catch-up sweep** for workspaces that accumulated
orphans before the cleanup was added (or for attachments that were uploaded
but never embedded).

Response:

```json
{ "removedFiles": 3, "removedRows": 3, "freedBytes": 1048576 }
```

`removedFiles` counts only files actually unlinked; rows whose on-disk file
was already missing contribute to `freedBytes` and `removedRows` but not
`removedFiles`. Safe to run on demand.

---

## Personal Access Tokens

Gated by the session cookie (`requireUserId()`), not by a bearer token — you mint tokens from a logged-in browser.

### `GET /api/tokens`

List the signed-in user's non-revoked tokens. Token bodies are never returned; only `{ id, name, prefix, lastUsedAt, createdAt }`. Ordered `createdAt DESC`.

### `POST /api/tokens`

Request: `{ "name": "Claude Desktop" }` (1–80 chars).

Response: `{ id, name, prefix, token }`. The `token` field (`snb_...`) is returned **once**; only its SHA-256 hash is persisted.

### `DELETE /api/tokens/:id`

Revokes a token (sets `revokedAt`). Subsequent calls with that token return `401`. Returns `{ ok: true }` or `404`.

---

## MCP

### `POST /api/mcp`

Stateless Streamable HTTP transport for the Model Context Protocol. JSON-RPC 2.0 in, JSON-RPC 2.0 out. Requires `Authorization: Bearer <snb_...>`; session cookies are **not** accepted. See [mcp.md](mcp.md) for the full tool reference and client-config examples.

`GET` and `DELETE` return `405` — there is no SSE stream and no session state in v1.

---

## DTO Shapes

Canonical TypeScript types live in `lib/types.ts`. Client-side hooks (`lib/api/hooks.ts`) and the fetch wrapper (`lib/api/client.ts`) speak these types end-to-end. If you add or change an endpoint, update `lib/types.ts` **and** this file in the same change.

Notable shapes added in v1.2:

- `BacklinkDTO` — `{ id, title, snippet, updatedAt }`. Returned by `GET /api/notes/:id/backlinks`.
- Semantic search result — `NoteListItemDTO & { score: number }` where `score` is cosine similarity in `[0, 1]`.
- `{ id, title }[]` — returned by `GET /api/notes/titles` (the typeahead shape; intentionally minimal so a keystroke-per-character popup stays cheap).

Notable shapes updated in v1.3:

- `FolderDTO` — gains `parentId: string | null` for nested-folder support. Top-level folders carry `parentId: null`. The client builds the tree from this flat list (`buildFolderTree` in `components/app/Sidebar.tsx`).
- `PATCH /api/tags/:id` response — `{ id: string, merged: boolean }`. The surviving tag's id (same as input on a pure rename, the existing tag's id on merge) plus a flag telling the client whether memberships got rewritten.
