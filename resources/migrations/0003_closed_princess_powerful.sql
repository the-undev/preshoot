PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target` text NOT NULL,
	`composer` text DEFAULT 'brief' NOT NULL,
	`clip_id` integer,
	`brief` text NOT NULL,
	`fields` text NOT NULL,
	`composition` text,
	`rendered` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_generations`("id", "target", "composer", "clip_id", "brief", "fields", "composition", "rendered", "model", "created_at") SELECT "id", "target", "composer", "clip_id", "brief", "fields", "composition", "rendered", "model", "created_at" FROM `generations`;--> statement-breakpoint
DROP TABLE `generations`;--> statement-breakpoint
ALTER TABLE `__new_generations` RENAME TO `generations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;