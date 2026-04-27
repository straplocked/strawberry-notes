-- Trigram index on `notes.title` for the `[[` autocomplete endpoint.
--
-- The /api/notes/titles handler (and the FTS fallback in listNotes) does an
-- ILIKE '%q%' against `notes.title`, which cannot use a btree index. With
-- thousands of notes per user the substring scan starts to show up. The
-- pg_trgm GIN index makes ILIKE substring queries index-friendly without
-- changing the query — Postgres picks it up automatically.
--
-- Cost: one extension + one GIN index. Safe to add at any size; on tiny
-- corpora the planner ignores it and seq-scan wins anyway.

CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_title_trgm_idx"
  ON "notes" USING GIN ("title" gin_trgm_ops);
