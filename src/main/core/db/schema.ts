import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Project-level key/value settings such as default target model and clip length. */
export const projectSettings = sqliteTable("project_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

/** Every prompt the app has generated for this project, kept whether or not it was used. */
export const generations = sqliteTable("generations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  target: text("target").notNull(),
  brief: text("brief").notNull(),
  fields: text("fields", { mode: "json" }).$type<Record<string, string>>().notNull(),
  rendered: text("rendered").notNull(),
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})
