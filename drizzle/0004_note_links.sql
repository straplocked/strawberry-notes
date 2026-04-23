CREATE TABLE "note_links" (
	"source_id" uuid NOT NULL,
	"target_id" uuid,
	"target_title" text NOT NULL,
	CONSTRAINT "note_links_source_id_target_title_pk" PRIMARY KEY("source_id","target_title")
);
--> statement-breakpoint
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_source_id_notes_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_target_id_notes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_links_target_idx" ON "note_links" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "note_links_title_idx" ON "note_links" USING btree ("target_title");