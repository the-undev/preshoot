ALTER TABLE `workflow_slots` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `workflow_slots` ADD `note` text DEFAULT '' NOT NULL;