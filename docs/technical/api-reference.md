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

Bulk import Markdown files.

Request: `multipart/form-data` with one or more `files[]` entries (each a `.md`).

Behaviour per file:
- First `# H1` becomes the title. If absent, filename (without extension) is used.
- Body parsed via `lib/markdown/from-markdown.ts` → PM JSON.
- Inserted against the current user, placed in no folder.

Response: `{ imported: <uuid>[] }`.

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

### `POST /api/attachments/gc`

Sweep orphaned attachments for the current user. An attachment is orphaned if
`noteId IS NULL` (never attached, or its note was hard-deleted before the
attachment-file cleanup existed) or if the referenced note no longer exists.
Files are unlinked from disk and DB rows are deleted.

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
