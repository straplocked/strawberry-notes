-- Outbound webhooks. Each row is one delivery target owned by one user.
-- The `events` text[] holds the event names (e.g. "note.created") this
-- webhook subscribes to; firing checks `events && ARRAY['note.created']`.
-- The secret is shown to the operator once at creation time and stored as a
-- SHA-256 hex hash, mirroring the `api_tokens` model.

CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret_hash" text NOT NULL,
	"events" text[] NOT NULL DEFAULT '{}',
	"enabled" boolean NOT NULL DEFAULT true,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error_message" text,
	"consecutive_failures" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhooks_user_idx" ON "webhooks" USING btree ("user_id");
