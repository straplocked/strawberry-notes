# Database

[← Technical TOC](README.md)

Postgres 16, accessed via Drizzle ORM (`drizzle-orm` + `drizzle-kit`).

- **Schema source of truth:** `lib/db/schema.ts`
- **Client:** `lib/db/client.ts` (singleton `pg.Pool` + Drizzle wrapper)
- **Migrations:** `drizzle/` (generated; applied by Docker entrypoint on boot)
- **Config:** `drizzle.config.ts` (dialect `postgresql`, reads `DATABASE_URL`)

---

## Tables

### `users`

| Column         | Type           | Notes                          |
| -------------- | -------------- | ------------------------------ |
| `id`           | `uuid` PK      | `gen_random_uuid()`            |
| `email`        | `text` UNIQUE  | lowercased by the signup route |
| `passwordHash` | `text`         | `bcryptjs.hash(..., 10)`       |
| `createdAt`    | `timestamptz`  | default `now()`                |

### `folders`

| Column      | Type         | Notes                                                           |
| ----------- | ------------ | --------------------------------------------------------------- |
| `id`        | `uuid` PK    |                                                                 |
| `userId`    | `uuid` FK    | → `users.id` ON DELETE CASCADE                                  |
| `parentId`  | `uuid` FK?   | → `folders.id` ON DELETE CASCADE — self-FK for nested folders   |
| `name`      | `text`       |                                                                 |
| `color`     | `text`       | hex (`#e33d4e` default); user-editable via the sidebar dot picker |
| `position`  | `integer`    | for manual ordering                                             |
| `createdAt` | `timestamptz`|                                                                 |

Indexes:
- `folders_user_idx` on `(userId, position)`.
- `folders_parent_idx` on `(parentId)` — speeds tree-walk queries.

`parentId IS NULL` for top-level folders. `ON DELETE CASCADE` on the self-FK
means deleting a parent removes the entire subtree of folders; the existing
`notes.folderId ON DELETE SET NULL` then takes care of any notes inside that
subtree (they fall back to the "All Notes" view). Cycle prevention is enforced
in `lib/notes/folder-service.ts` (`assertParentLegal`) — Postgres has no
native check for cycles in a recursive FK.

### `notes`

| Column        | Type          | Notes                                                    |
| ------------- | ------------- | -------------------------------------------------------- |
| `id`          | `uuid` PK     |                                                          |
| `userId`      | `uuid` FK     | → `users.id` ON DELETE CASCADE                           |
| `folderId`    | `uuid` FK?    | → `folders.id` ON DELETE SET NULL                        |
| `title`       | `text`        |                                                          |
| `content`     | `jsonb`       | ProseMirror document (source of truth)                   |
| `contentText` | `text`        | flattened plain text mirror (for search / list snippets) |
| `snippet`     | `text`        | Precomputed first non-empty prose line (≤ ~180 chars). Server-maintained on save. |
| `hasImage`    | `boolean`     | Precomputed flag — true when the doc embeds at least one image. |
| `pinned`      | `boolean`     | default `false`                                          |
| `trashedAt`   | `timestamptz?`| NULL unless soft-deleted                                 |
| `contentEmbedding` | `vector(N)` | pgvector embedding; populated by the worker. `N = EMBEDDING_DIMS`. |
| `embeddingStale`   | `boolean`   | True until the worker has embedded the current content. Set on every content/title edit. |
| `createdAt`   | `timestamptz` |                                                          |
| `updatedAt`   | `timestamptz` | bumped on every PATCH                                    |

Indexes:
- `notes_user_folder_idx` on `(userId, folderId, updatedAt)` — folder view.
- `notes_user_pinned_idx` on `(userId, pinned, updatedAt)` — pinned view.
- `notes_user_trashed_idx` on `(userId, trashedAt, updatedAt DESC)` — trash view.
- `notes_content_tsv_idx` — GIN over the `content_tsv` generated tsvector column. See [Full-text search](#full-text-search) below.
- `notes_title_trgm_idx` — GIN over `title` using `gin_trgm_ops` (pg_trgm). Speeds the `[[`-autocomplete ILIKE substring scan into the thousands of notes per user.
- `notes_content_embedding_idx` — IVFFlat on `content_embedding` with `vector_cosine_ops`. Only populated when the feature is configured.

### `tags`

| Column      | Type         | Notes                              |
| ----------- | ------------ | ---------------------------------- |
| `id`        | `uuid` PK    |                                    |
| `userId`    | `uuid` FK    | → `users.id` ON DELETE CASCADE     |
| `name`      | `text`       | lowercased, trimmed, ≤40 chars     |
| `createdAt` | `timestamptz`|                                    |

Uniqueness is per-user (`(userId, name)`) and enforced by upsert logic in `lib/notes/tag-resolution.ts` rather than a DB constraint — kept simple on purpose.

### `note_tags` (join)

| Column   | Type      | Notes                              |
| -------- | --------- | ---------------------------------- |
| `noteId` | `uuid` FK | → `notes.id` ON DELETE CASCADE     |
| `tagId`  | `uuid` FK | → `tags.id` ON DELETE CASCADE      |

Primary key: `(noteId, tagId)`. Index: `note_tags_tag_idx` on `(tagId)` for reverse lookup.

### `note_links` (wiki-link graph)

| Column        | Type      | Notes                                                                |
| ------------- | --------- | -------------------------------------------------------------------- |
| `sourceId`    | `uuid` FK | → `notes.id` ON DELETE CASCADE — note containing the `[[Title]]`.    |
| `targetId`    | `uuid` FK?| → `notes.id` ON DELETE SET NULL — null while the title is unresolved.|
| `targetTitle` | `text`    | Lowercased target title, kept so unresolved rows can re-bind later.  |

Primary key: `(sourceId, targetTitle)`. Indexes: `note_links_target_idx` on
`(targetId)` for backlink lookup; `note_links_title_idx` on `(targetTitle)`
for the resolve-pending sweep when a note's title changes or a new note is
created. See [editor.md](editor.md) for the resolution flow.

### `attachments`

| Column        | Type         | Notes                                        |
| ------------- | ------------ | -------------------------------------------- |
| `id`          | `uuid` PK    |                                              |
| `userId`      | `uuid` FK    | → `users.id` ON DELETE CASCADE               |
| `noteId`      | `uuid` FK?   | → `notes.id` ON DELETE SET NULL (nullable)   |
| `filename`    | `text`       | original filename (for download)             |
| `mime`        | `text`       | one of the allowed image MIMEs               |
| `size`        | `integer`    | bytes                                        |
| `storagePath` | `text`       | path relative to `UPLOAD_DIR`                |
| `createdAt`   | `timestamptz`|                                              |

---

## Relations (Drizzle)

```
users ──┬── folders          (1:N, cascade)
        ├── notes            (1:N, cascade)
        ├── tags             (1:N, cascade)
        ├── attachments      (1:N, cascade)
        └── api_tokens       (1:N, cascade)

folders ── folders           (self-FK, cascade — nested folder tree)
folders ── notes             (1:N, set null on folder delete)

notes ──┬── note_tags ── tags  (M:N)
        ├── note_links ── notes  (graph; source cascades, target set null)
        └── attachments      (1:N, set null on note delete)
```

---

## Migrations

Generated into `drizzle/`:

- `0000_nebulous_colonel_america.sql` — base schema.
- `0001_fts.sql` — `content_tsv` generated column + GIN index.
- `0002_api_tokens.sql` — personal access tokens (`api_tokens`).
- `0003_perf_columns.sql` — precomputed `snippet` + `has_image` columns.
- `0004_note_links.sql` — `note_links` table for the wiki-link graph.
- `0005_embeddings.sql` — pgvector extension, `content_embedding` column, IVFFlat index.
- `0006_title_trgm.sql` — `pg_trgm` extension + GIN index on `notes.title`.
- `0007_nested_folders.sql` — `folders.parent_id` self-FK + `folders_parent_idx`.

Workflow:

```bash
# after editing lib/db/schema.ts
npm run db:generate   # writes new migration under drizzle/
npm run db:migrate    # applies pending migrations
```

In production, the Docker entrypoint (`docker/entrypoint.sh`) runs `drizzle-kit migrate` before starting the server, so a `docker compose up` on a fresh DB lands on the latest schema automatically.

`npm run db:push` is available for fast iteration in dev (applies schema without writing a migration file) — **do not use in production**; it skips the migration history.

`npm run db:studio` opens Drizzle Studio for visual inspection.

---

## Full-Text Search

`0001_fts.sql` adds Postgres `tsvector` + `websearch_to_tsquery` support over `notes.title` and `notes.contentText`. The list endpoint (`app/api/notes/route.ts`) uses FTS when a `q` parameter is provided, with an `ILIKE` fallback for very short queries. Results are always scoped to the requesting user and exclude `trashedAt IS NOT NULL` unless the caller explicitly asks for the trash view.

The 500-item list cap is hardcoded in that route handler — raise it there if needed; Postgres handles far more comfortably.

---

## Semantic Search

`0005_embeddings.sql` enables the `vector` extension (from the `pgvector/pgvector:pg16` image) and adds a `content_embedding vector(N)` column plus an IVFFlat cosine index.

- **Population path.** `lib/notes/service.ts` sets `embedding_stale = true` on every content or title edit and calls `kickEmbeddingWorker()`. The worker (`lib/embeddings/worker.ts`) pulls up to 16 stale rows with `SELECT … FOR UPDATE SKIP LOCKED`, embeds them via the OpenAI-compatible client, and writes the vectors back.
- **Safe under N replicas.** `SKIP LOCKED` means two replicas pulling concurrently never collide; each row is processed exactly once.
- **Query path.** `POST /api/notes/search/semantic` and the `search_semantic` MCP tool both call `semanticSearch()` in `lib/embeddings/search.ts`, which embeds the query then runs `ORDER BY content_embedding <=> $vec LIMIT k`, returning a `score = 1 - distance` per row.
- **Graceful when unconfigured.** `EMBEDDING_ENDPOINT` empty → worker is a no-op, search returns 503 / `isError: true`. Nothing else is affected.
- **Backfill.** `npm run db:embed` (wraps `scripts/embed-backfill.ts`) drains every stale row in batches. Safe to run while the app is live.

See [deployment.md](deployment.md#semantic-search-optional) for the operator-facing env vars and re-embed procedure.

---

## Connection Config

`lib/db/client.ts`:

- `pg.Pool` with `max: 10`.
- In dev (`NODE_ENV !== 'production'`), the pool is stashed on `globalThis` so HMR doesn't leak connections.
- Drizzle instance is exported as `db` and imported directly by every query site.

The pool size is a sensible default for a self-hosted personal/team deployment. Increase it if you put the app behind high-fanout traffic; you'll usually want to add a Postgres connection pooler (PgBouncer) before you raise this number.

---

## Data Lifecycle Notes

- **Soft delete:** `DELETE /api/notes/[id]` currently hard-deletes; the "trash" view is populated by PATCHing `trashedAt` to `now()`. Soft-deleted notes are excluded from FTS results.
- **Tag cleanup:** `DELETE /api/tags/:id` removes the tag row and its `note_tags` rows via cascade — the notes themselves survive. Renaming a tag to an existing name (`PATCH /api/tags/:id`) performs a *merge*: every `note_tags` row pointing at the source is rewritten to the existing tag (`INSERT … ON CONFLICT DO NOTHING`), then the source row is dropped. Empty tags drop out of the list endpoint's count naturally.
- **Folder delete:** The folder's notes survive (their `folderId` becomes NULL and they appear under "All notes"). With nested folders, deleting a parent cascade-deletes every descendant folder; notes inside the cascaded subtree all fall back to "All notes".
- **User delete:** There is no self-serve user-delete path in v1. An operator can `DELETE FROM users WHERE id = ...`; cascades clean up all child rows and any orphaned files on disk should be reaped manually (see [uploads.md](uploads.md)).
