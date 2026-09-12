ALTER TABLE `clips` ADD `short_edge` integer DEFAULT 768 NOT NULL;--> statement-breakpoint
ALTER TABLE `clips` ADD `aspect_ratio` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `clips` ADD `seed` integer DEFAULT 0 NOT NULL;