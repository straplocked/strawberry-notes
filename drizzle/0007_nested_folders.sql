-- Nested folders: add a self-referential `parent_id` column so folders can
-- form a tree. Top-level folders have `parent_id = NULL`. Cycle prevention
-- is enforced in the service layer (lib/notes/folder-service.ts) — Postgres
-- has no native "no cycles in a recursive FK" check.

ALTER TABLE "folders" ADD COLUMN "parent_id" uuid;--> statement-breakpoint

ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "folders_parent_idx" ON "folders" USING btree ("parent_id");
