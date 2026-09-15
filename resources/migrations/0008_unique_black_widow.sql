PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shot_assets` (
	`shot_id` integer NOT NULL,
	`asset_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`shot_id`, `asset_id`),
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shot_assets`("shot_id", "asset_id", "position") SELECT "shot_id", "asset_id", "position" FROM `shot_assets`;--> statement-breakpoint
DROP TABLE `shot_assets`;--> statement-breakpoint
ALTER TABLE `__new_shot_assets` RENAME TO `shot_assets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `assets` ADD `clip_id` integer;--> statement-breakpoint
ALTER TABLE `assets` ADD `voice` text;--> statement-breakpoint
ALTER TABLE `shot_lines` ADD `subject_ids` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `assets` ADD `copied_from` integer;--> statement-breakpoint
INSERT INTO `assets` (`clip_id`, `kind`, `name`, `description`, `created_at`, `copied_from`)
SELECT used.clip_id, a.kind, a.name, a.description, a.created_at, a.id
FROM (
  SELECT DISTINCT s.clip_id AS clip_id, sa.asset_id AS asset_id
  FROM `shot_assets` sa JOIN `shots` s ON s.id = sa.shot_id
  UNION
  SELECT DISTINCT s.clip_id, sl.asset_id
  FROM `shot_lines` sl JOIN `shots` s ON s.id = sl.shot_id WHERE sl.asset_id IS NOT NULL
  UNION
  SELECT DISTINCT sp.clip_id, sp.asset_id
  FROM `speakers` sp WHERE sp.asset_id IS NOT NULL
) AS used
JOIN `assets` a ON a.id = used.asset_id
WHERE a.clip_id IS NULL;--> statement-breakpoint
INSERT INTO `asset_images` (`asset_id`, `file_name`, `media_type`, `position`, `created_at`)
SELECT c.id, i.file_name, i.media_type, i.position, i.created_at
FROM `assets` c JOIN `asset_images` i ON i.asset_id = c.copied_from
WHERE c.copied_from IS NOT NULL;--> statement-breakpoint
INSERT INTO `assets` (`clip_id`, `kind`, `name`, `description`, `voice`, `created_at`)
SELECT sp.clip_id, 'person', substr(sp.description, 1, 40), sp.description, sp.description,
       (SELECT created_at FROM `clips` WHERE id = sp.clip_id)
FROM `speakers` sp WHERE sp.asset_id IS NULL AND trim(sp.description) != '';--> statement-breakpoint
UPDATE `assets` SET `voice` = (
  SELECT sp.description FROM `speakers` sp
  WHERE sp.asset_id = `assets`.`copied_from` AND sp.clip_id = `assets`.`clip_id`
) WHERE `copied_from` IS NOT NULL AND EXISTS (
  SELECT 1 FROM `speakers` sp
  WHERE sp.asset_id = `assets`.`copied_from` AND sp.clip_id = `assets`.`clip_id`
);--> statement-breakpoint
UPDATE `shot_assets` SET `asset_id` = (
  SELECT c.id FROM `assets` c JOIN `shots` s ON s.id = `shot_assets`.`shot_id`
  WHERE c.copied_from = `shot_assets`.`asset_id` AND c.clip_id = s.clip_id
) WHERE EXISTS (
  SELECT 1 FROM `assets` c JOIN `shots` s ON s.id = `shot_assets`.`shot_id`
  WHERE c.copied_from = `shot_assets`.`asset_id` AND c.clip_id = s.clip_id
);--> statement-breakpoint
UPDATE `clip_frames` SET `image_id` = (
  SELECT ci.id FROM `asset_images` ci
  JOIN `assets` c ON c.id = ci.asset_id
  JOIN `asset_images` oi ON oi.id = `clip_frames`.`image_id`
  WHERE c.copied_from = oi.asset_id AND c.clip_id = `clip_frames`.`clip_id`
    AND ci.file_name = oi.file_name
) WHERE EXISTS (
  SELECT 1 FROM `asset_images` ci
  JOIN `assets` c ON c.id = ci.asset_id
  JOIN `asset_images` oi ON oi.id = `clip_frames`.`image_id`
  WHERE c.copied_from = oi.asset_id AND c.clip_id = `clip_frames`.`clip_id`
    AND ci.file_name = oi.file_name
);--> statement-breakpoint
UPDATE `shot_lines` SET `subject_ids` = json_array((
  SELECT c.id FROM `assets` c JOIN `shots` s ON s.id = `shot_lines`.`shot_id`
  WHERE c.copied_from = `shot_lines`.`asset_id` AND c.clip_id = s.clip_id
)) WHERE `kind` = 'action' AND `asset_id` IS NOT NULL AND EXISTS (
  SELECT 1 FROM `assets` c JOIN `shots` s ON s.id = `shot_lines`.`shot_id`
  WHERE c.copied_from = `shot_lines`.`asset_id` AND c.clip_id = s.clip_id
);--> statement-breakpoint
UPDATE `shot_lines` SET `subject_ids` = (
  SELECT json_group_array(subject.id) FROM json_each(`shot_lines`.`speaker_ids`) AS spoken
  JOIN `speakers` sp ON sp.id = spoken.value
  JOIN `shots` s ON s.id = `shot_lines`.`shot_id`
  JOIN `assets` subject ON subject.clip_id = s.clip_id AND (
    subject.copied_from = sp.asset_id
    OR (sp.asset_id IS NULL AND subject.voice = sp.description AND subject.copied_from IS NULL)
  )
) WHERE `kind` = 'speech' AND json_array_length(`speaker_ids`) > 0;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `copied_from`;
