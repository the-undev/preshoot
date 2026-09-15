PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` integer,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`voice` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_assets`("id", "clip_id", "kind", "name", "description", "voice", "created_at") SELECT "id", "clip_id", "kind", "name", "description", "voice", "created_at" FROM `assets`;--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
ALTER TABLE `__new_assets` RENAME TO `assets`;--> statement-breakpoint
CREATE TABLE `__new_open_tabs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` integer,
	`position` integer NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_open_tabs`("id", "clip_id", "position") SELECT "id", "clip_id", "position" FROM `open_tabs`;--> statement-breakpoint
DROP TABLE `open_tabs`;--> statement-breakpoint
ALTER TABLE `__new_open_tabs` RENAME TO `open_tabs`;--> statement-breakpoint
CREATE TABLE `__new_shots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` integer,
	`name` text,
	`position` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`camera_motion` text,
	`amplitude` text,
	`speed` text,
	`transition` text,
	`lighting` text,
	`sound_note` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shots`("id", "clip_id", "name", "position", "duration_ms", "camera_motion", "amplitude", "speed", "transition", "lighting", "sound_note") SELECT "id", "clip_id", NULL, "position", "duration_ms", "camera_motion", "amplitude", "speed", "transition", "lighting", "sound_note" FROM `shots`;--> statement-breakpoint
DROP TABLE `shots`;--> statement-breakpoint
ALTER TABLE `__new_shots` RENAME TO `shots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
