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

| Column      | Type         | Notes                                |
| ----------- | ------------ | ------------------------------------ |
| `id`        | `uuid` PK    |                                      |
| `userId`    | `uuid` FK    | → `users.id` ON DELETE CASCADE       |
| `name`      | `text`       |                                      |
| `color`     | `text`       | hex (`#e33d4e` default)              |
| `position`  | `integer`    | for manual ordering                  |
| `createdAt` | `timestamptz`|                                      |

Indexes: `folders_user_idx` on `(userId, position)`.

### `notes`

| Column        | Type          | Notes                                                    |
| ------------- | ------------- | -------------------------------------------------------- |
| `id`          | `uuid` PK     |                                                          |
| `userId`      | `uuid` FK     | → `users.id` ON DELETE CASCADE                           |
| `folderId`    | `uuid` FK?    | → `folders.id` ON DELETE SET NULL                        |
| `title`       | `text`        |                                                          |
| `content`     | `jsonb`       | ProseMirror document (source of truth)                   |
| `contentText` | `text`        | flattened plain text mirror (for search / list snippets) |
| `pinned`      | `boolean`     | default `false`                                          |
| `trashedAt`   | `timestamptz?`| NULL unless soft-deleted                                 |
| `createdAt`   | `timestamptz` |                                                          |
| `updatedAt`   | `timestamptz` | bumped on every PATCH                                    |

Indexes:
- `notes_user_folder_idx` on `(userId, folderId, updatedAt)` — folder view.
- `notes_user_pinned_idx` on `(userId, pinned, updatedAt)` — pinned view.
- FTS: see [Full-text search](#full-text-search) below.
- `notes_content_embedding_idx` — IVFFlat on `content_embedding` with `vector_cosine_ops`. See [Semantic search](#semantic-search) below. Optional; only populated when the feature is configured.

Additional columns (`0004_embeddings.sql`):

| Column              | Type            | Notes                                                         |
| ------------------- | --------------- | ------------------------------------------------------------- |
| `content_embedding` | `vector(N)`     | Populated by the in-process embedding worker. N = `EMBEDDING_DIMS`. |
| `embedding_stale`   | `boolean`       | True until the worker has embedded the current content. Set on every content or title edit. |

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
        └── attachments      (1:N, cascade)

folders ── notes             (1:N, set null on folder delete)

notes ──┬── note_tags ── tags  (M:N)
        └── attachments      (1:N, set null on note delete)
```

---

## Migrations

Generated into `drizzle/`:

- `0000_nebulous_colonel_america.sql` — base schema.
- `0001_fts.sql` — full-text search setup.
- `0002_api_tokens.sql` — personal access tokens.
- `0003_perf_columns.sql` — precomputed snippet + has-image columns.
- `0004_embeddings.sql` — pgvector extension, `content_embedding` column, IVFFlat index.

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

`0004_embeddings.sql` enables the `vector` extension (from the `pgvector/pgvector:pg16` image) and adds a `content_embedding vector(N)` column plus an IVFFlat cosine index.

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
- **Tag cleanup:** Deleting a tag removes `note_tags` rows via cascade but leaves the tag row unless the user deletes it explicitly. Empty tags drop out of the list endpoint's count naturally.
- **Folder delete:** Notes survive (their `folderId` becomes NULL and they appear under "All notes").
- **User delete:** There is no self-serve user-delete path in v1. An operator can `DELETE FROM users WHERE id = ...`; cascades clean up all child rows and any orphaned files on disk should be reaped manually (see [uploads.md](uploads.md)).
