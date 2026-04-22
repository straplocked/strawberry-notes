ALTER TABLE "notes" ADD COLUMN "snippet" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "has_image" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "attachments_user_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attachments_note_idx" ON "attachments" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "notes_user_trashed_idx" ON "notes" USING btree ("user_id","trashed_at","updated_at" DESC NULLS LAST);--> statement-breakpoint
-- Backfill precomputed list columns from the existing content_text / content.
-- Rough heuristic only: every subsequent PATCH/POST replaces these with canonical
-- values computed via snippetFromDoc() + docHasImage() in lib/editor/prosemirror-utils.ts.
UPDATE "notes"
SET
  "snippet" = substring(
    trim(both E' \n\t' from split_part("content_text", E'\n', 1))
    from 1 for 180
  ),
  "has_image" = ("content"::text LIKE '%"type":"image"%');
