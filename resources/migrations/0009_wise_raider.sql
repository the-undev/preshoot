DROP TABLE `speakers`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shot_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`subject_ids` text DEFAULT '[]' NOT NULL,
	`text` text NOT NULL,
	`language` text,
	`off_screen` integer DEFAULT false NOT NULL,
	`crosses_cut` integer DEFAULT false NOT NULL,
	`cut_off` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shot_lines`("id", "shot_id", "position", "kind", "subject_ids", "text", "language", "off_screen", "crosses_cut", "cut_off") SELECT "id", "shot_id", "position", "kind", "subject_ids", "text", "language", "off_screen", "crosses_cut", "cut_off" FROM `shot_lines`;--> statement-breakpoint
DROP TABLE `shot_lines`;--> statement-breakpoint
ALTER TABLE `__new_shot_lines` RENAME TO `shot_lines`;--> statement-breakpoint
PRAGMA foreign_keys=ON;