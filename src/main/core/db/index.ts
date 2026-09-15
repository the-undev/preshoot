import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import * as schema from "./schema"

export type ProjectDatabase = ReturnType<typeof drizzle<typeof schema>>

/** The handle inside a transaction, which carries the same query builder as the database itself. */
export type ProjectTransaction = Parameters<Parameters<ProjectDatabase["transaction"]>[0]>[0]

/** Either handle, for helpers that read or write the same way inside a transaction and out. */
export type ProjectDb = ProjectDatabase | ProjectTransaction

/** An open project database together with the call that releases its file handle. */
export interface ProjectDatabaseHandle {
  db: ProjectDatabase
  close(): void
}

/** Opens or creates a project database at `databasePath` and brings it up to the current schema. */
export function openProjectDatabase(
  databasePath: string,
  migrationsFolder: string
): ProjectDatabaseHandle {
  const sqlite = new Database(databasePath)
  sqlite.pragma("journal_mode = WAL")

  /*
   * SQLite rewrites a table by copying it, and a migration that does so drops the original, which
   * takes everything pointing at it with it. The migrations say `PRAGMA foreign_keys=OFF` to stop
   * that, but the migrator runs them inside a transaction, where that pragma does nothing. So the
   * keys are off while they run and on for everything after.
   */
  sqlite.pragma("foreign_keys = OFF")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  sqlite.pragma("foreign_keys = ON")
  return {
    db,
    close: () => sqlite.close(),
  }
}

export { schema }
