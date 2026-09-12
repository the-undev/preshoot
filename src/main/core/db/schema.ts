import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { ClipComposition } from "../composition/clip"
import type { ClipProse } from "../composition/prose"

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

/** One clip: a few shots that become a single prompt. */
export const clips = sqliteTable("clips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  target: text("target").notNull(),
  style: text("style").notNull(),
  note: text("note").notNull(),
  musicNote: text("music_note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

/** A voice in a clip. Its position is its number, so speaker 1 is spoken of as (S1). */
export const speakers = sqliteTable("speakers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clipId: integer("clip_id")
    .notNull()
    .references(() => clips.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
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
  action: text("action").notNull(),
  soundNote: text("sound_note").notNull(),
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

/** One spoken line, kept as typed because the target reproduces it word for word. */
export const dialogueLines = sqliteTable("dialogue_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shotId: integer("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  speakerId: integer("speaker_id")
    .notNull()
    .references(() => speakers.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  language: text("language").notNull(),
  text: text("text").notNull(),
})

/** Every prompt the app has generated for this project, kept whether or not it was used. */
export const generations = sqliteTable("generations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  target: text("target").notNull(),
  composer: text("composer").notNull().default("brief"),
  clipId: integer("clip_id").references(() => clips.id, { onDelete: "set null" }),
  brief: text("brief").notNull(),
  fields: text("fields", { mode: "json" }).$type<Record<string, string>>().notNull(),
  composition: text("composition", { mode: "json" }).$type<ClipComposition>(),
  prose: text("prose", { mode: "json" }).$type<ClipProse>(),
  rendered: text("rendered").notNull(),
  model: text("model"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})
