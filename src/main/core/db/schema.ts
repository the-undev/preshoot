import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Project-level key/value settings such as default target model and clip length. */
export const projectSettings = sqliteTable("project_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

/**
 * The people, places and objects a clip refers to. A subject belongs to the clip that holds it,
 * and one with no clip is saved in the library as a starting point, copied whenever it is used.
 */
export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // A plain column rather than a key. Removing a clip has to take the picture files of its cast
  // off the disk as well as their rows, which nothing a key does can reach, so it does both.
  clipId: integer("clip_id"),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  // How they sound, which the prompt needs to fix a voice. Nothing until they say something.
  voice: text("voice"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

/** Reference pictures of a library thing, copied into the project so it can be moved. */
export const assetImages = sqliteTable("asset_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mediaType: text("media_type").notNull(),
  position: integer("position").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

/** One clip: a few shots that become a single prompt. */
export const clips = sqliteTable("clips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Nothing until the clip is saved: an unsaved clip is a scratch one, reachable only from its tab.
  name: text("name"),
  target: text("target").notNull(),
  style: text("style").notNull(),
  note: text("note").notNull(),
  musicNote: text("music_note").notNull(),
  // Everything heard in the clip that nobody says. One field, because the target has one.
  soundscape: text("soundscape").notNull().default(""),
  form: text("form").notNull().default("t2v"),
  shortEdge: integer("short_edge").notNull().default(768),
  aspectRatio: text("aspect_ratio").notNull().default("16:9"),
  // What is spoken in this clip unless a line says otherwise, since most clips are in one language.
  language: text("language").notNull().default("English"),
  // The saved clip this one was branched from, which a branch of a branch still points at. A plain
  // column rather than a key: a self-referencing key would be checked row by row on every insert.
  savedFromId: integer("saved_from_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

/** A picture a clip is anchored to, for the forms that begin or end on one. */
export const clipFrames = sqliteTable("clip_frames", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clipId: integer("clip_id")
    .notNull()
    .references(() => clips.id, { onDelete: "cascade" }),
  imageId: integer("image_id")
    .notNull()
    .references(() => assetImages.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
})

/** One shot of a clip. The vocabulary columns hold values the target accepts, or nothing. */
export const shots = sqliteTable("shots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Nothing when the shot is saved in the library as a starting point rather than used in a clip.
  clipId: integer("clip_id").references(() => clips.id, { onDelete: "cascade" }),
  // The name it was saved under. A shot in a clip has none: it is called by its place in the clip.
  name: text("name"),
  position: integer("position").notNull(),
  durationMs: integer("duration_ms").notNull(),
  cameraMotion: text("camera_motion"),
  amplitude: text("amplitude"),
  speed: text("speed"),
  transition: text("transition"),
  lighting: text("lighting"),
})

/**
 * What happens in a shot, in order: something someone does, or something someone says. Both are
 * one list, because a shot reads as one run of events rather than as everything that happens and
 * then everything that is said.
 */
export const shotLines = sqliteTable("shot_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shotId: integer("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  // Either "action" or "speech", which decides how many subjects the line can name.
  kind: text("kind").notNull(),
  /*
   * Who the line is about. An action names one subject or none, which means the scene. Speech
   * names at least one, and several sharing a line are written as a compound id such as (S1,S2).
   * A list rather than a key, so nothing points at a subject and removing one edits these.
   */
  subjectIds: text("subject_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
  // Kept as typed, because the target reproduces what is said word for word.
  text: text("text").notNull(),
  // Nothing unless this line is spoken in another language than the rest of the clip.
  language: text("language"),
  offScreen: integer("off_screen", { mode: "boolean" }).notNull().default(false),
  crossesCut: integer("crosses_cut", { mode: "boolean" }).notNull().default(false),
  cutOff: integer("cut_off", { mode: "boolean" }).notNull().default(false),
})

/**
 * The tabs open in the workspace, left to right. A tab with no clip shows the list of clips, so
 * one can be opened without first opening another.
 */
export const openTabs = sqliteTable("open_tabs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // A plain column rather than a key. Removing a clip has to take the picture files of its cast
  // off the disk as well as their rows, which nothing a key does can reach, so it does both.
  clipId: integer("clip_id"),
  position: integer("position").notNull(),
})
