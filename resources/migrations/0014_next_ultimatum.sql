CREATE TABLE `shot_beats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`asset_id` integer,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- What each shot already said happens becomes its first beat.
INSERT INTO `shot_beats` (`shot_id`, `asset_id`, `position`, `text`) SELECT `id`, NULL, 0, `action` FROM `shots` WHERE trim(`action`) <> '';
