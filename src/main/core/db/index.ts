import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import * as schema from "./schema"

export type ProjectDatabase = ReturnType<typeof drizzle<typeof schema>>

/** Opens or creates a project database at `databasePath` and brings it up to the current schema. */
export function openProjectDatabase(
  databasePath: string,
  migrationsFolder: string
): ProjectDatabase {
  const sqlite = new Database(databasePath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

export { schema }
