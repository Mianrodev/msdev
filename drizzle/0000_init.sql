CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`event` text NOT NULL,
	`prior_status` text,
	`new_status` text,
	`reason` text,
	`actor` text NOT NULL,
	`detail` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `history_ws_entity` ON `history` (`workspace_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`file_name` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`sheet` text NOT NULL,
	`row_number` integer NOT NULL,
	`raw` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`outcome` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `import_rows_batch` ON `import_rows` (`batch_id`,`sheet`);--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor` text NOT NULL,
	`summary` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`dedup_key` text NOT NULL,
	`account` text NOT NULL,
	`opportunity` text NOT NULL,
	`source_url` text,
	`next_step_url` text,
	`source_board` text,
	`location` text,
	`date_found` text,
	`stage` text DEFAULT 'discovery' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_verification` text DEFAULT 'unverified' NOT NULL,
	`discovery_verdict` text,
	`discovery_reason` text,
	`screen_verdict` text,
	`screen_reason` text,
	`screen_confidence` integer,
	`screened_at` text,
	`triage_verdict` text,
	`triage_reason` text,
	`triage_confidence` integer,
	`triaged_at` text,
	`verify_verdict` text,
	`verify_reason` text,
	`verify_confidence` integer,
	`verified_at` text,
	`fit_tier` text,
	`location_fit` text,
	`value_fit` text,
	`requirements` text,
	`gaps_hard` text,
	`gaps_soft` text,
	`fit_rationale` text,
	`prepared_brief` text,
	`prepared_answers` text,
	`last_verified_at` text,
	`response_notes` text,
	`outreach_status` text DEFAULT 'not_started' NOT NULL,
	`contact_name` text,
	`contact_email` text,
	`contact_phone` text,
	`contact_profile_url` text,
	`hold_reason` text,
	`next_action` text,
	`hold_since` text,
	`archive_reason` text,
	`archived_at` text,
	`notes` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	`extra` text DEFAULT '{}' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`last_reconciled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_ws_dedup` ON `records` (`workspace_id`,`dedup_key`);--> statement-breakpoint
CREATE INDEX `records_ws_stage_status` ON `records` (`workspace_id`,`stage`,`status`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`applies_from` text DEFAULT 'screen' NOT NULL,
	`field` text DEFAULT '' NOT NULL,
	`operator` text NOT NULL,
	`value` text,
	`effect` text DEFAULT 'reject' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_ws_key` ON `rules` (`workspace_id`,`key`);--> statement-breakpoint
CREATE TABLE `settings` (
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_ws_key` ON `settings` (`workspace_id`,`key`);--> statement-breakpoint
CREATE TABLE `target_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`dedup_key` text NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`source_url` text,
	`fit` text,
	`contact_name` text,
	`contact_email` text,
	`contact_phone` text,
	`contact_profile_url` text,
	`description` text,
	`evidence` text,
	`fit_rationale` text,
	`prepared_brief` text,
	`prepared_brief_long` text,
	`response_notes` text,
	`status` text DEFAULT 'tracking' NOT NULL,
	`archive_reason` text,
	`notes` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	`extra` text DEFAULT '{}' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `target_accounts_ws_dedup` ON `target_accounts` (`workspace_id`,`dedup_key`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
