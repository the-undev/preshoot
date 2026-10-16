import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema } from "."

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** The migration that gave each slot whether its text runs over several lines. */
const MULTILINE_MIGRATION = "0018_ordinary_magik"

/** A copy of the migrations folder holding only what ran before `MULTILINE_MIGRATION`. */
function migrationsBefore(dir: string): string {
  const folder = join(dir, "before")
  cpSync(migrationsFolder, folder, { recursive: true })
  const journalPath = join(folder, "meta", "_journal.json")
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { tag: string }[]
  }
  const at = journal.entries.findIndex((entry) => entry.tag === MULTILINE_MIGRATION)
  if (at === -1) {
    throw new Error(`${MULTILINE_MIGRATION} is not in the journal`)
  }
  journal.entries = journal.entries.slice(0, at)
  writeFileSync(journalPath, JSON.stringify(journal, null, 2))
  return folder
}

describe("the migration to multiline slots", () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-multiline-"))
    path = join(dir, "project.db")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("marks the slots of multiline string nodes as multiline and no others", () => {
    const before = openProjectDatabase(path, migrationsBefore(dir))
    before.close()
    const sqlite = new Database(path)
    sqlite.exec(`
      INSERT INTO workflows (id, name, source_path, graph, content_hash, imported_at, updated_at)
        VALUES (1, 'Edit', '/flows/edit.json', '{"nodes":[]}', 'abc', 0, 0);
      INSERT INTO workflow_slots
          (workflow_id, node_id, node_type, name, kind, tier, bypassed, position)
        VALUES
          (1, 14, 'PrimitiveStringMultiline', 'Prompt', 'text', 'basic', 0, 0),
          (1, 15, 'PrimitiveString', 'Name', 'text', 'basic', 0, 1),
          (1, 20, 'PrimitiveInt', 'Steps', 'integer', 'basic', 0, 2);
    `)
    sqlite.close()

    const handle = openProjectDatabase(path, migrationsFolder)
    const slots = handle.db.select().from(schema.workflowSlots).all()

    expect(slots.map((slot) => [slot.nodeType, slot.multiline])).toEqual([
      ["PrimitiveStringMultiline", true],
      ["PrimitiveString", false],
      ["PrimitiveInt", false],
    ])
    handle.close()
  })
})
