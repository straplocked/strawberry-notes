CREATE TABLE "user_encryption" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"passphrase_wrap" jsonb NOT NULL,
	"recovery_wrap" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "encryption" jsonb;--> statement-breakpoint
ALTER TABLE "user_encryption" ADD CONSTRAINT "user_encryption_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Partial index for the "encryption IS NOT NULL" predicate used by the
-- bearer-token (MCP / web clipper) gating in lib/notes/service.ts. Most rows
-- in `notes` will be plaintext (encryption IS NULL); only the small private
-- subset benefits from being indexed for the negative filter.
CREATE INDEX "notes_encryption_idx" ON "notes" ((encryption IS NOT NULL)) WHERE encryption IS NOT NULL;