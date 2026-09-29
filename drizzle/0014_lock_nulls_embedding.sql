-- Backfill: a note that is currently locked (Private Notes, `encryption IS
-- NOT NULL`) must never carry a leftover `content_embedding`. Before this
-- release, `updateNote`'s plaintext→private transition (lib/notes/service.ts)
-- zeroed `contentText` / `snippet` / `hasImage` / `embeddingStale` on lock but
-- did NOT null `contentEmbedding` — a note embedded while plaintext and then
-- locked kept its last-computed vector server-side, reachable by
-- `search_semantic` even though the body itself became ciphertext. The
-- application code is fixed alongside this migration; this statement cleans
-- up any row that was locked under the old behaviour. See
-- docs/technical/private-notes.md ("contentEmbedding | NULL (never
-- embedded)").
--
-- `content_embedding` only exists when pgvector was available at migration
-- time (see drizzle/0005_embeddings.sql's graceful-degradation DO block) —
-- guard on the column's existence so this is a no-op, not an error, on a
-- server running without pgvector.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'notes' AND column_name = 'content_embedding'
  ) THEN
    UPDATE "notes"
    SET "content_embedding" = NULL
    WHERE "encryption" IS NOT NULL AND "content_embedding" IS NOT NULL;
  END IF;
END $$;
