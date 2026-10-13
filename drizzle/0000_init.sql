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
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `history_ws_entity` ON `history` (`workspace_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `opp_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`module` text NOT NULL,
	`mode` text NOT NULL,
	`dedup_key` text NOT NULL,
	`provider` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`source_url` text,
	`retrieved_at` text NOT NULL,
	`published_at` text,
	`fields` text DEFAULT '{}' NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`enrichment` text,
	`last_match` text,
	`last_search_id` text,
	`saved_at` text,
	`status` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opp_items_ws_identity` ON `opp_items` (`workspace_id`,`module`,`mode`,`dedup_key`);--> statement-breakpoint
CREATE INDEX `opp_items_ws_saved` ON `opp_items` (`workspace_id`,`module`,`saved_at`);--> statement-breakpoint
CREATE TABLE `opp_list_items` (
	`workspace_id` text NOT NULL,
	`list_id` text NOT NULL,
	`item_id` text NOT NULL,
	`added_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`list_id`) REFERENCES `opp_lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `opp_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opp_list_items_uq` ON `opp_list_items` (`list_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `opp_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`module` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opp_lists_ws_name` ON `opp_lists` (`workspace_id`,`module`,`name`);--> statement-breakpoint
CREATE TABLE `opp_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`item_id` text NOT NULL,
	`body` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `opp_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `opp_notes_item` ON `opp_notes` (`workspace_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `opp_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`search_id` text NOT NULL,
	`item_id` text NOT NULL,
	`rank` integer NOT NULL,
	`match` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`search_id`) REFERENCES `opp_searches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `opp_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `opp_results_search` ON `opp_results` (`search_id`,`rank`);--> statement-breakpoint
CREATE TABLE `opp_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`module` text NOT NULL,
	`mode` text NOT NULL,
	`query` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`providers` text DEFAULT '[]' NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`error` text,
	`result_count` integer DEFAULT 0 NOT NULL,
	`actor` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `opp_searches_ws_module` ON `opp_searches` (`workspace_id`,`module`,`started_at`);--> statement-breakpoint
CREATE TABLE `opp_usage` (
	`workspace_id` text NOT NULL,
	`bucket` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opp_usage_uq` ON `opp_usage` (`workspace_id`,`bucket`);--> statement-breakpoint
CREATE TABLE `settings` (
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_ws_key` ON `settings` (`workspace_id`,`key`);--> statement-breakpoint
CREATE TABLE `source_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`fetched_at` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`workspace_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`session_epoch` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_sign_in_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
