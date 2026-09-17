/*
 * What a shot shows moves out of `shot_assets` and into its lines, as a line of kind `shows`.
 *
 * The editor went on offering the project library where it should have offered the clip's own
 * cast, so a shot made since the cast arrived points at a library asset that `subjectOf` cannot
 * find. Anything a clip's shot names is copied into that clip's cast first, reusing a cast member
 * of the same name rather than making a second one, and every reference is repointed at the copy.
 * Pictures are left on the library original: two rows naming one file would let deleting either
 * clip take the file from under the other.
 *
 * A saved shot has no clip, and the subjects beside it are library rows on purpose, so it is left
 * pointing where it points.
 */
CREATE TABLE `__subject_needed` (
	`old_id` integer NOT NULL,
	`clip_id` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__subject_needed` (`old_id`, `clip_id`)
SELECT DISTINCT used.asset_id, used.clip_id FROM (
  SELECT s.clip_id AS clip_id, sa.asset_id AS asset_id
  FROM `shot_assets` sa JOIN `shots` s ON s.id = sa.shot_id
  WHERE s.clip_id IS NOT NULL
  UNION
  SELECT s.clip_id, sid.value
  FROM `shot_lines` sl
  JOIN `shots` s ON s.id = sl.shot_id, json_each(sl.subject_ids) AS sid
  WHERE s.clip_id IS NOT NULL
) AS used
JOIN `assets` a ON a.id = used.asset_id
WHERE a.clip_id IS NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `copied_from` integer;--> statement-breakpoint
INSERT INTO `assets` (`clip_id`, `kind`, `name`, `description`, `voice`, `created_at`, `copied_from`)
SELECT n.clip_id, a.kind, a.name, a.description, a.voice, a.created_at, a.id
FROM `__subject_needed` n JOIN `assets` a ON a.id = n.old_id
WHERE NOT EXISTS (
  SELECT 1 FROM `assets` e WHERE e.clip_id = n.clip_id AND e.name = a.name
);--> statement-breakpoint
CREATE TABLE `__subject_copies` (
	`old_id` integer NOT NULL,
	`clip_id` integer NOT NULL,
	`new_id` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__subject_copies` (`old_id`, `clip_id`, `new_id`)
SELECT n.old_id, n.clip_id, COALESCE(
  (SELECT c.id FROM `assets` c WHERE c.clip_id = n.clip_id AND c.copied_from = n.old_id),
  (SELECT e.id FROM `assets` e JOIN `assets` a ON a.id = n.old_id
   WHERE e.clip_id = n.clip_id AND e.name = a.name LIMIT 1)
)
FROM `__subject_needed` n;--> statement-breakpoint
UPDATE `shot_lines` SET `subject_ids` = (
  SELECT json_group_array(COALESCE(m.new_id, sid.value))
  FROM json_each(`shot_lines`.`subject_ids`) AS sid
  LEFT JOIN `__subject_copies` m ON m.old_id = sid.value
    AND m.clip_id = (SELECT s.clip_id FROM `shots` s WHERE s.id = `shot_lines`.`shot_id`)
) WHERE json_array_length(`subject_ids`) > 0;--> statement-breakpoint
UPDATE `shot_lines` SET `position` = `position` + (
  SELECT COUNT(*) FROM `shot_assets` sa WHERE sa.shot_id = `shot_lines`.`shot_id`
);--> statement-breakpoint
INSERT INTO `shot_lines` (
  `shot_id`, `position`, `kind`, `subject_ids`, `text`, `language`,
  `off_screen`, `crosses_cut`, `cut_off`
)
SELECT sa.shot_id, sa.position, 'shows', json_array(COALESCE(
  (SELECT m.new_id FROM `__subject_copies` m JOIN `shots` s ON s.id = sa.shot_id
   WHERE m.old_id = sa.asset_id AND m.clip_id = s.clip_id),
  sa.asset_id
)), '', NULL, 0, 0, 0
FROM `shot_assets` sa;--> statement-breakpoint
DROP TABLE `__subject_needed`;--> statement-breakpoint
DROP TABLE `__subject_copies`;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `copied_from`;--> statement-breakpoint
DROP TABLE `shot_assets`;
