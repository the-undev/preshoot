CREATE TABLE `shot_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`asset_id` integer,
	`speaker_ids` text DEFAULT '[]' NOT NULL,
	`text` text NOT NULL,
	`language` text,
	`off_screen` integer DEFAULT false NOT NULL,
	`crosses_cut` integer DEFAULT false NOT NULL,
	`cut_off` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `clips` ADD `language` text DEFAULT 'English' NOT NULL;
--> statement-breakpoint
INSERT INTO `shot_lines` (`shot_id`, `position`, `kind`, `asset_id`, `speaker_ids`, `text`, `language`, `off_screen`, `crosses_cut`, `cut_off`)
SELECT `shot_id`, `position`, 'action', `asset_id`, '[]', `text`, NULL, false, false, false FROM `shot_beats`;--> statement-breakpoint
INSERT INTO `shot_lines` (`shot_id`, `position`, `kind`, `asset_id`, `speaker_ids`, `text`, `language`, `off_screen`, `crosses_cut`, `cut_off`)
SELECT `shot_id`, `position` + (SELECT COUNT(*) FROM `shot_beats` WHERE `shot_beats`.`shot_id` = `dialogue_lines`.`shot_id`), 'speech', NULL, `speaker_ids`, `text`, `language`, `off_screen`, `crosses_cut`, `cut_off` FROM `dialogue_lines`;
