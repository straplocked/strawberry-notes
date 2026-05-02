ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK (role IN ('user', 'admin'));--> statement-breakpoint
-- Bootstrap admin: the first existing user (by createdAt ASC) is the
-- operator who set the instance up — promote them so /admin/users is
-- reachable without an extra CLI step. On a fresh install this UPDATE
-- no-ops and lib/auth.ts auto-promotes the first sign-in instead.
UPDATE "users"
SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1);
