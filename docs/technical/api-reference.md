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
- Inserts `users` row and a default `folders` row named "Journal".

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

| Param     | Values                                 | Meaning                                           |
| --------- | -------------------------------------- | ------------------------------------------------- |
| `folder`  | `all` \| `pinned` \| `trash` \| `<uuid>` | Which view. Default `all`.                      |
| `tag`     | `<uuid>`                               | Filter to notes that carry this tag.              |
| `q`       | string                                 | FTS query over title + `contentText` (websearch). |

- Excludes soft-deleted notes except when `folder=trash`.
- Orders by `updatedAt DESC` (pinned view: `pinned DESC, updatedAt DESC`).
- Hard-capped at **500 items**.

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
{ "name": "My folder", "color": "#e33d4e" }
```

`color` defaults to `#e33d4e` (strawberry accent) if omitted. Returns the new `FolderDTO`.

### `PATCH /api/folders/:id`

Partial update: `name`, `color`, `position`.

### `DELETE /api/folders/:id`

Deletes the folder. Notes previously in it survive with `folderId = NULL` (i.e. appear under "All notes").

---

## Tags

### `GET /api/tags`

All tags for the user, each with a `count` of associated non-trashed notes. Ordered `count DESC, name ASC`.

Tags are created implicitly via `PATCH /api/notes/:id` with `tagNames`. There is no direct tag-create endpoint in v1.

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
