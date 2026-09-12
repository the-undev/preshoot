PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_dialogue_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`speaker_ids` text DEFAULT '[]' NOT NULL,
	`position` integer NOT NULL,
	`language` text NOT NULL,
	`text` text NOT NULL,
	`off_screen` integer DEFAULT false NOT NULL,
	`crosses_cut` integer DEFAULT false NOT NULL,
	`cut_off` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dialogue_lines`("id", "shot_id", "speaker_ids", "position", "language", "text", "off_screen", "crosses_cut", "cut_off") SELECT "id", "shot_id", "speaker_ids", "position", "language", "text", "off_screen", "crosses_cut", "cut_off" FROM `dialogue_lines`;--> statement-breakpoint
DROP TABLE `dialogue_lines`;--> statement-breakpoint
ALTER TABLE `__new_dialogue_lines` RENAME TO `dialogue_lines`;--> statement-breakpoint
PRAGMA foreign_keys=ON;