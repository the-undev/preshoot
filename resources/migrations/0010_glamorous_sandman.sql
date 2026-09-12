CREATE TABLE `clip_frames` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` integer NOT NULL,
	`image_id` integer NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `asset_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `clips` ADD `form` text DEFAULT 't2v' NOT NULL;