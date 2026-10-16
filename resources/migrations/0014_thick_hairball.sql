CREATE TABLE `workflow_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workflow_id` integer NOT NULL,
	`node_id` integer NOT NULL,
	`node_type` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`tier` text NOT NULL,
	`bypassed` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`source_path` text NOT NULL,
	`graph` text NOT NULL,
	`content_hash` text NOT NULL,
	`imported_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
