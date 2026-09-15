PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_clips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`target` text NOT NULL,
	`style` text NOT NULL,
	`note` text NOT NULL,
	`music_note` text NOT NULL,
	`form` text DEFAULT 't2v' NOT NULL,
	`short_edge` integer DEFAULT 768 NOT NULL,
	`aspect_ratio` text DEFAULT '16:9' NOT NULL,
	`saved_from_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_clips`("id", "name", "target", "style", "note", "music_note", "form", "short_edge", "aspect_ratio", "saved_from_id", "created_at") SELECT "id", "name", "target", "style", "note", "music_note", "form", "short_edge", "aspect_ratio", "saved_from_id", "created_at" FROM `clips`;--> statement-breakpoint
DROP TABLE `clips`;--> statement-breakpoint
ALTER TABLE `__new_clips` RENAME TO `clips`;--> statement-breakpoint
UPDATE `clips` SET `aspect_ratio` = '16:9' WHERE `aspect_ratio` = 'auto';--> statement-breakpoint
PRAGMA foreign_keys=ON;