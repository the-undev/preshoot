CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target` text NOT NULL,
	`style` text NOT NULL,
	`note` text NOT NULL,
	`music_note` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dialogue_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shot_id` integer NOT NULL,
	`speaker_id` integer NOT NULL,
	`position` integer NOT NULL,
	`language` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`speaker_id`) REFERENCES `speakers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shot_assets` (
	`shot_id` integer NOT NULL,
	`asset_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`shot_id`, `asset_id`),
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `shots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` integer NOT NULL,
	`position` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`camera_motion` text,
	`amplitude` text,
	`speed` text,
	`transition` text,
	`lighting` text,
	`action` text NOT NULL,
	`sound_note` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `speakers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` integer NOT NULL,
	`position` integer NOT NULL,
	`description` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `generations` ADD `composer` text DEFAULT 'brief' NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `clip_id` integer REFERENCES clips(id);--> statement-breakpoint
ALTER TABLE `generations` ADD `composition` text;