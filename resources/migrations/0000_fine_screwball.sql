CREATE TABLE `asset_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`media_type` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clip_frames` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` integer NOT NULL,
	`image_id` integer NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `asset_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `clips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target` text NOT NULL,
	`style` text NOT NULL,
	`note` text NOT NULL,
	`music_note` text NOT NULL,
	`form` text DEFAULT 't2v' NOT NULL,
	`short_edge` integer DEFAULT 768 NOT NULL,
	`aspect_ratio` text DEFAULT 'auto' NOT NULL,
	`seed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dialogue_lines` (
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
CREATE TABLE `generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target` text NOT NULL,
	`composer` text DEFAULT 'brief' NOT NULL,
	`clip_id` integer,
	`clip_note` text NOT NULL,
	`fields` text NOT NULL,
	`composition` text,
	`request` text,
	`prose` text,
	`rendered` text NOT NULL,
	`model` text,
	`run_id` text,
	`prompt_variant_id` text,
	`system_prompt` text,
	`verdict` text,
	`note` text DEFAULT '' NOT NULL,
	`parent_id` integer,
	`edit_instruction` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `project_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_id` text NOT NULL,
	`strategy` text NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`created_at` integer NOT NULL
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
	`sound_note` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `speakers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` integer NOT NULL,
	`position` integer NOT NULL,
	`asset_id` integer,
	`description` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
