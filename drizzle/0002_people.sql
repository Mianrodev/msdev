CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"user_id" text,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"workspace_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"recovery_hash" text,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sign_in_at" text,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_uq" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
-- The existing single owner becomes the first person: same password, same recovery code.
INSERT INTO "users" ("id", "name", "role", "workspace_id", "password_hash", "recovery_hash")
SELECT 'owner', 'Owner', 'owner', s."workspace_id", s."value" #>> '{}',
  (SELECT NULLIF(r."value" #>> '{}', '') FROM "settings" r WHERE r."workspace_id" = s."workspace_id" AND r."key" = 'auth.recoveryHash')
FROM "settings" s
WHERE s."workspace_id" = 'default' AND s."key" = 'auth.passwordHash' AND COALESCE(s."value" #>> '{}', '') <> ''
ON CONFLICT DO NOTHING;
