import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema } from "./index"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("openProjectDatabase", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-db-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("creates the file, applies migrations and round-trips a setting", () => {
    const { db, close } = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
    db.insert(schema.projectSettings)
      .values({ key: "targetModel", value: "h3", updatedAt: new Date() })
      .run()
    const rows = db.select().from(schema.projectSettings).all()
    expect(rows.map((r) => [r.key, r.value])).toEqual([["targetModel", "h3"]])
    close()
  })

  it("is idempotent on an existing database", () => {
    const path = join(dir, "project.db")
    openProjectDatabase(path, migrationsFolder).close()
    const { db, close } = openProjectDatabase(path, migrationsFolder)
    expect(db.select().from(schema.projectSettings).all()).toEqual([])
    close()
  })

  it("releases the file handle on close", () => {
    const { db, close } = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
    close()
    expect(() => db.select().from(schema.projectSettings).all()).toThrow()
  })
})
