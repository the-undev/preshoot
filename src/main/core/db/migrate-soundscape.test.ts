import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema } from "."

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** The migration that moved what is heard off the shots and onto the clip. */
const SOUNDSCAPE_MIGRATION = "0012_flashy_prism"

/** A copy of the migrations folder holding only what ran before `SOUNDSCAPE_MIGRATION`. */
function migrationsBefore(dir: string): string {
  const folder = join(dir, "before")
  cpSync(migrationsFolder, folder, { recursive: true })
  const journalPath = join(folder, "meta", "_journal.json")
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] }
  const at = journal.entries.findIndex((entry) => entry.tag === SOUNDSCAPE_MIGRATION)
  if (at === -1) {
    throw new Error(`${SOUNDSCAPE_MIGRATION} is not in the journal`)
  }
  journal.entries = journal.entries.slice(0, at)
  writeFileSync(journalPath, JSON.stringify(journal, null, 2))
  return folder
}

describe("the migration that moves what is heard onto the clip", () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-sound-"))
    path = join(dir, "project.db")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** Two clips: one whose shots were given sound out of order, and one that was given none. */
  function projectBeforeTheMigration(): void {
    const before = openProjectDatabase(path, migrationsBefore(dir))
    before.close()

    const sqlite = new Database(path)
    sqlite.exec(`
      INSERT INTO clips (id, name, target, style, note, music_note, created_at)
        VALUES (1, 'One', 'minimax-h3', 'Live-action', '', '', 0),
               (2, 'Two', 'minimax-h3', 'Live-action', '', '', 0);
      INSERT INTO shots (id, clip_id, position, duration_ms, sound_note)
        VALUES (2, 1, 1, 4000, 'the lamp motor grinding'),
               (1, 1, 0, 4000, 'wind battering the glass'),
               (3, 1, 2, 4000, '   '),
               (4, 2, 0, 4000, '');
    `)
    sqlite.close()
  }

  it("keeps what the shots held, joined in the order the prompt joined them", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const [one] = handle.db.select().from(schema.clips).all()

    expect(one.soundscape).toBe("wind battering the glass the lamp motor grinding")
    handle.close()
  })

  it("gives a clip whose shots were silent nothing rather than a run of spaces", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const two = handle.db
      .select()
      .from(schema.clips)
      .all()
      .find((clip) => clip.name === "Two")

    expect(two?.soundscape).toBe("")
    handle.close()
  })

  it("leaves the shots themselves alone", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)

    expect(handle.db.select().from(schema.shots).all()).toHaveLength(4)
    handle.close()
  })
})
