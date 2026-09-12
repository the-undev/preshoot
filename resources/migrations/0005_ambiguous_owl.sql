CREATE TABLE `prompt_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_id` text NOT NULL,
	`strategy` text NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `generations` ADD `run_id` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `prompt_variant_id` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `system_prompt` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `verdict` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `note` text DEFAULT '' NOT NULL;