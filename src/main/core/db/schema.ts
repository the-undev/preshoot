import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Project-level key/value settings such as default target model and clip length. */
export const projectSettings = sqliteTable("project_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

/** Things the clips refer to: the people, places and objects of this project. */
export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
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
  form: text("form").notNull().default("t2v"),
  shortEdge: integer("short_edge").notNull().default(768),
  aspectRatio: text("aspect_ratio").notNull().default("16:9"),
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

/** A voice in a clip. Its position is its number, so speaker 1 is spoken of as (S1). */
export const speakers = sqliteTable("speakers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clipId: integer("clip_id")
    .notNull()
    .references(() => clips.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  // A voice is either one of the library's subjects or somebody described here and nowhere else.
  assetId: integer("asset_id").references(() => assets.id, { onDelete: "set null" }),
  description: text("description").notNull(),
})

/** One shot of a clip. The vocabulary columns hold values the target accepts, or nothing. */
export const shots = sqliteTable("shots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clipId: integer("clip_id")
    .notNull()
    .references(() => clips.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  durationMs: integer("duration_ms").notNull(),
  cameraMotion: text("camera_motion"),
  amplitude: text("amplitude"),
  speed: text("speed"),
  transition: text("transition"),
  lighting: text("lighting"),
  soundNote: text("sound_note").notNull(),
})

/**
 * What happens in a shot, in order. A beat belongs to one of the shot's subjects, or to nobody
 * when it is about the scene rather than a person.
 */
export const shotBeats = sqliteTable("shot_beats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shotId: integer("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").references(() => assets.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
  text: text("text").notNull(),
})

/** Which library things a shot shows. Restricted, so a thing in use cannot vanish under a clip. */
export const shotAssets = sqliteTable(
  "shot_assets",
  {
    shotId: integer("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "cascade" }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.shotId, table.assetId] })]
)

/**
 * One spoken line, kept as typed because the target reproduces it word for word. Several speakers
 * can share a line, which the target writes as a compound id such as (S1,S2), so the speakers are
 * a list rather than a key. Nothing else in the schema points at speakers, so removing one has to
 * take itself out of these by hand.
 */
export const dialogueLines = sqliteTable("dialogue_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shotId: integer("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  speakerIds: text("speaker_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
  position: integer("position").notNull(),
  language: text("language").notNull(),
  text: text("text").notNull(),
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
  clipId: integer("clip_id").references(() => clips.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
})
