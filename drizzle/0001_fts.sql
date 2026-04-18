-- Add full-text search support to notes.
--
-- We add a generated tsvector column indexing title + flattened content, and a
-- GIN index for fast text queries via websearch_to_tsquery.

ALTER TABLE "notes"
  ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce("title", '') || ' ' || coalesce("content_text", '')
    )
  ) STORED;

CREATE INDEX "notes_content_tsv_idx" ON "notes" USING GIN ("content_tsv");
