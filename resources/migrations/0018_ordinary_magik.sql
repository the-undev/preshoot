ALTER TABLE `workflow_slots` ADD `multiline` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `workflow_slots` SET `multiline` = 1 WHERE `node_type` = 'PrimitiveStringMultiline';
