ALTER TABLE `dialogue_lines` ADD `speaker_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `dialogue_lines` ADD `off_screen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dialogue_lines` ADD `crosses_cut` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dialogue_lines` ADD `cut_off` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Every line written before a line could have several speakers keeps the one it had.
UPDATE `dialogue_lines` SET `speaker_ids` = json_array(`speaker_id`) WHERE `speaker_ids` = '[]';