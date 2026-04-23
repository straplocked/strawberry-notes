-- Semantic-search columns on `notes`.
--
-- 1. Enable the pgvector extension (bundled in the pgvector/pgvector image).
--    NOTE: `CREATE EXTENSION` requires superuser (or explicit CREATE on the
--    database). The default `postgres` role in the pgvector image has it.
--    If you run migrations as a restricted app role, grant the role CREATE
--    on the database once, or pre-create the extension as a superuser.
-- 2. Add the embedding column + stale flag.
-- 3. Index the embedding with IVFFlat for fast cosine ANN.
--    IMPORTANT: IVFFlat is a training-based index and is being built against
--    an empty column here. Query performance is effectively sequential-scan
--    until you run `npm run db:embed` (or enough writes happen to populate
--    at least `lists` rows with vectors). After the backfill, consider
--    `REINDEX INDEX CONCURRENTLY notes_content_embedding_idx` to rebuild the
--    clusters against the populated data — especially before shipping the
--    feature to users.
--
-- Changing the dimension is destructive: drop the index + column and re-add.
-- See docs/technical/deployment.md.

CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "content_embedding" vector(1024);--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "embedding_stale" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- IVFFlat is the pragmatic default: good recall at reasonable memory cost,
-- and it works on pgvector >= 0.4 (the pgvector/pgvector:pg16 image ships a
-- newer release). HNSW is available too — swap if you need faster recall at
-- the cost of build time. `lists` is tuned for small deployments; bump it
-- (roughly rows / 1000) for larger corpora.
CREATE INDEX "notes_content_embedding_idx"
  ON "notes" USING ivfflat ("content_embedding" vector_cosine_ops)
  WITH (lists = 100);
