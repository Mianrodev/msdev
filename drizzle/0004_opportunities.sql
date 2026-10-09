CREATE TABLE "opp_items" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"module" text NOT NULL,
	"mode" text NOT NULL,
	"dedup_key" text NOT NULL,
	"provider" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"source_url" text,
	"retrieved_at" text NOT NULL,
	"published_at" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enrichment" jsonb,
	"last_match" jsonb,
	"last_search_id" text,
	"saved_at" text,
	"status" text,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opp_list_items" (
	"workspace_id" text NOT NULL,
	"list_id" text NOT NULL,
	"item_id" text NOT NULL,
	"added_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opp_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"module" text NOT NULL,
	"name" text NOT NULL,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opp_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"item_id" text NOT NULL,
	"body" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opp_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "opp_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" text NOT NULL,
	"search_id" text NOT NULL,
	"item_id" text NOT NULL,
	"rank" integer NOT NULL,
	"match" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opp_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"module" text NOT NULL,
	"mode" text NOT NULL,
	"query" jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"result_count" integer DEFAULT 0 NOT NULL,
	"actor" text NOT NULL,
	"started_at" text NOT NULL,
	"finished_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opp_usage" (
	"workspace_id" text NOT NULL,
	"bucket" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" text DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opp_items" ADD CONSTRAINT "opp_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_list_items" ADD CONSTRAINT "opp_list_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_list_items" ADD CONSTRAINT "opp_list_items_list_id_opp_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."opp_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_list_items" ADD CONSTRAINT "opp_list_items_item_id_opp_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."opp_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_lists" ADD CONSTRAINT "opp_lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_notes" ADD CONSTRAINT "opp_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_notes" ADD CONSTRAINT "opp_notes_item_id_opp_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."opp_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_results" ADD CONSTRAINT "opp_results_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_results" ADD CONSTRAINT "opp_results_search_id_opp_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."opp_searches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_results" ADD CONSTRAINT "opp_results_item_id_opp_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."opp_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_searches" ADD CONSTRAINT "opp_searches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opp_usage" ADD CONSTRAINT "opp_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opp_items_ws_identity" ON "opp_items" USING btree ("workspace_id","module","mode","dedup_key");--> statement-breakpoint
CREATE INDEX "opp_items_ws_saved" ON "opp_items" USING btree ("workspace_id","module","saved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opp_list_items_uq" ON "opp_list_items" USING btree ("list_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opp_lists_ws_name" ON "opp_lists" USING btree ("workspace_id","module","name");--> statement-breakpoint
CREATE INDEX "opp_notes_item" ON "opp_notes" USING btree ("workspace_id","item_id");--> statement-breakpoint
CREATE INDEX "opp_results_search" ON "opp_results" USING btree ("search_id","rank");--> statement-breakpoint
CREATE INDEX "opp_searches_ws_module" ON "opp_searches" USING btree ("workspace_id","module","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opp_usage_uq" ON "opp_usage" USING btree ("workspace_id","bucket");