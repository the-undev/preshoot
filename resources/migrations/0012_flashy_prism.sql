/*
 * What is heard moves off the shot and onto the clip.
 *
 * The target has one field for the whole clip, so a note per shot was a distinction the prompt
 * could not carry: the notes were joined into that one field on the way out and there was nothing
 * to hand them back to on the way in. Each clip keeps the notes its shots held, joined in shot
 * order the way the prompt joined them, so nothing anybody wrote is lost.
 */
ALTER TABLE `clips` ADD `soundscape` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `clips` SET `soundscape` = COALESCE(
  (
    SELECT group_concat(heard.sound_note, ' ')
    FROM (
      SELECT `sound_note`
      FROM `shots`
      WHERE `clip_id` = `clips`.`id` AND trim(`sound_note`) <> ''
      ORDER BY `position`
    ) AS heard
  ),
  ''
);--> statement-breakpoint
ALTER TABLE `shots` DROP COLUMN `sound_note`;
