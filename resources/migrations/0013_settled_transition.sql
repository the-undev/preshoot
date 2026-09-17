/*
 * The cut a shot is cut into with becomes something the shot holds rather than something the
 * prompt invents.
 *
 * Every shot after the first was written as `the camera cuts to` whether or not anybody chose it,
 * while the chip that sets it read as empty, so the prompt said something the editor did not.
 * A shot carries the cut now, which is what lets it be seen and taken away. Filling in what the
 * shots already behaved as leaves every prompt reading exactly as it read before.
 */
UPDATE `shots` SET `transition` = 'the camera cuts to' WHERE `transition` IS NULL;
