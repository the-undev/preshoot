CREATE TABLE `generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target` text NOT NULL,
	`brief` text NOT NULL,
	`fields` text NOT NULL,
	`rendered` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL
);
