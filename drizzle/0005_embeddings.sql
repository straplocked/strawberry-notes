-- Semantic-search columns on `notes`.
--
-- pgvector is OPTIONAL: Strawberry can also run against a plain shared
-- Postgres server (no `vector` extension, or one the migrating role isn't
-- allowed to install) — e.g. the all-in-one image pointed at an existing
-- `postgres:17` instance owned by a non-superuser role. The whole migration
-- is wrapped in a DO block that degrades gracefully in either failure mode:
--   * extension not listed in `pg_available_extensions`  → skipped, NOTICE
--     logged.
--   * extension listed but `CREATE EXTENSION` raises `insufficient_privilege`
--     (see below — this is the common case, not a rare edge case) → skipped,
--     NOTICE logged, same as above.
--   * extension created successfully → embedding column + stale flag +
--     IVFFlat index are created, exactly as before.
-- Either degraded path still boots the app; `lib/embeddings/availability.ts`
-- detects the missing `content_embedding` column at runtime (cached after
-- the first check) and the embedding worker stays idle while semantic
-- search falls back to full-text search. See docs/technical/deployment.md.
--
-- IMPORTANT, verified against `pgvector/pgvector:pg17-trixie` (pgvector
-- 0.8.6 — the version behind our shared production Postgres): the `vector`
-- extension is NOT marked "trusted" there
-- (`select trusted from pg_available_extension_versions where name='vector'`
-- returns `f`), so a non-superuser database-OWNER role still gets
-- `ERROR: permission denied to create extension "vector" / HINT: Must be
-- superuser to create this extension` — owning the database is not enough.
-- Do not assume "pgvector >= 0.5 is trusted" without checking the specific
-- build; this one isn't. A superuser has to run `CREATE EXTENSION vector`
-- once (or `ALTER EXTENSION vector UPDATE` after an upgrade); after that,
-- the app's own DB-owner role can use it freely — extension use, unlike
-- extension creation, doesn't require superuser.
--
-- Why edit this file in place instead of adding a new migration:
-- drizzle's own migrator (`drizzle-orm/pg-core` dialect's `migrate()`, which
-- is what `drizzle-kit migrate` calls) decides which migrations to
-- (re-)apply purely by comparing each migration's journal timestamp
-- (`folderMillis`, i.e. `meta/_journal.json`'s `when`) against the newest
-- `created_at` already recorded in `drizzle.__drizzle_migrations` — see
-- `node_modules/drizzle-orm/pg-core/dialect.js`'s `migrate()`. The `hash`
-- column is written for the record but is NEVER read back to gate
-- re-execution. A database that already applied this migration (recorded
-- under the OLD file's hash) has a `created_at` for 0005 (or a later
-- migration) that is already >= this file's timestamp, so drizzle will never
-- re-run it — guarded or not, changing the file's on-disk text/hash is safe
-- for already-migrated installs. Only genuinely fresh installs (nothing
-- applied yet, or partially applied up to 0004 because the old unguarded
-- 0005 previously failed here) execute this file's current text. That is
-- exactly the population this fix targets, so we edit in place rather than
-- shipping a parallel "0014 fix up 0005" migration that could never rescue
-- an install already wedged on a failed 0005.
--
-- IVFFlat is a training-based index and is being built against an empty
-- column here. Query performance is effectively sequential-scan until you
-- run `npm run db:embed` (or enough writes happen to populate at least
-- `lists` rows with vectors). After the backfill, consider
-- `REINDEX INDEX CONCURRENTLY notes_content_embedding_idx` to rebuild the
-- clusters against the populated data — especially before shipping the
-- feature to users.
--
-- Changing the dimension is destructive: drop the index + column and re-add.
-- See docs/technical/deployment.md.

DO $$
DECLARE
  vector_ready boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS vector;
      vector_ready := true;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'pgvector is installed on this server, but this role does not have permission to CREATE EXTENSION vector (it is not marked "trusted" here, so owning the database is not enough — a superuser has to create it once). Skipping semantic-search columns (0005_embeddings); the app still boots and semantic search stays disabled. Once a superuser runs CREATE EXTENSION vector, re-apply this file by hand (e.g. psql -f drizzle/0005_embeddings.sql) to add the embedding column/index — a plain restart will NOT retry it, since drizzle already recorded this migration as applied. See docs/technical/deployment.md.';
      WHEN OTHERS THEN
        RAISE NOTICE 'pgvector extension is listed as available but CREATE EXTENSION vector failed (%): % — skipping semantic-search columns (0005_embeddings). See docs/technical/deployment.md.', SQLSTATE, SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pgvector extension not available on this server — skipping semantic-search columns (0005_embeddings). The app still boots; semantic search stays disabled until pgvector is installed and this migration re-runs (it is safe to re-apply by hand once the extension exists). See docs/technical/deployment.md.';
  END IF;

  IF vector_ready THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'notes' AND column_name = 'content_embedding'
    ) THEN
      ALTER TABLE "notes" ADD COLUMN "content_embedding" vector(1024);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'notes' AND column_name = 'embedding_stale'
    ) THEN
      ALTER TABLE "notes" ADD COLUMN "embedding_stale" boolean DEFAULT true NOT NULL;
    END IF;

    -- IVFFlat is the pragmatic default: good recall at reasonable memory cost,
    -- and it works on pgvector >= 0.4 (the pgvector/pgvector:pg16 image ships
    -- a newer release). HNSW is available too — swap if you need faster
    -- recall at the cost of build time. `lists` is tuned for small
    -- deployments; bump it (roughly rows / 1000) for larger corpora.
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'notes_content_embedding_idx' AND n.nspname = current_schema()
    ) THEN
      CREATE INDEX "notes_content_embedding_idx"
        ON "notes" USING ivfflat ("content_embedding" vector_cosine_ops)
        WITH (lists = 100);
    END IF;
  END IF;
END $$;
