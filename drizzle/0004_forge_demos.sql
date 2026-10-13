CREATE TABLE "forge_demos" (
	"slug" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"business_name" text NOT NULL,
	"intake" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"written_by" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forge_demos" ADD CONSTRAINT "forge_demos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forge_demos_ws" ON "forge_demos" USING btree ("workspace_id","status");