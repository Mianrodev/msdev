CREATE TABLE "history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"event" text NOT NULL,
	"prior_status" text,
	"new_status" text,
	"reason" text,
	"actor" text NOT NULL,
	"detail" jsonb,
	"occurred_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"file_name" text NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"sheet" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor" text NOT NULL,
	"summary" jsonb NOT NULL,
	"started_at" text NOT NULL,
	"finished_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"account" text NOT NULL,
	"opportunity" text NOT NULL,
	"source_url" text,
	"next_step_url" text,
	"source_board" text,
	"location" text,
	"date_found" text,
	"stage" text DEFAULT 'discovery' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_verification" text DEFAULT 'unverified' NOT NULL,
	"discovery_verdict" text,
	"discovery_reason" text,
	"screen_verdict" text,
	"screen_reason" text,
	"screen_confidence" integer,
	"screened_at" text,
	"triage_verdict" text,
	"triage_reason" text,
	"triage_confidence" integer,
	"triaged_at" text,
	"verify_verdict" text,
	"verify_reason" text,
	"verify_confidence" integer,
	"verified_at" text,
	"fit_tier" text,
	"location_fit" text,
	"value_fit" text,
	"requirements" text,
	"gaps_hard" text,
	"gaps_soft" text,
	"fit_rationale" text,
	"prepared_brief" text,
	"prepared_answers" text,
	"last_verified_at" text,
	"response_notes" text,
	"outreach_status" text DEFAULT 'not_started' NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"contact_profile_url" text,
	"hold_reason" text,
	"next_action" text,
	"hold_since" text,
	"archive_reason" text,
	"archived_at" text,
	"notes" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"last_reconciled_at" text,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"applies_from" text DEFAULT 'screen' NOT NULL,
	"field" text DEFAULT '' NOT NULL,
	"operator" text NOT NULL,
	"value" jsonb,
	"effect" text DEFAULT 'reject' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"source_url" text,
	"fit" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"contact_profile_url" text,
	"description" text,
	"evidence" text,
	"fit_rationale" text,
	"prepared_brief" text,
	"prepared_brief_long" text,
	"response_notes" text,
	"status" text DEFAULT 'tracking' NOT NULL,
	"archive_reason" text,
	"notes" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_accounts" ADD CONSTRAINT "target_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_ws_entity" ON "history" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "import_rows_batch" ON "import_rows" USING btree ("batch_id","sheet");--> statement-breakpoint
CREATE UNIQUE INDEX "records_ws_dedup" ON "records" USING btree ("workspace_id","dedup_key");--> statement-breakpoint
CREATE INDEX "records_ws_stage_status" ON "records" USING btree ("workspace_id","stage","status");--> statement-breakpoint
CREATE UNIQUE INDEX "rules_ws_key" ON "rules" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_ws_key" ON "settings" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "target_accounts_ws_dedup" ON "target_accounts" USING btree ("workspace_id","dedup_key");