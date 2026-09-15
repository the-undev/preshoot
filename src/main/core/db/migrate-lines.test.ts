import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema } from "."

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** The migration that put what happens and what is said into one list. */
const LINES_MIGRATION = "0006_harsh_captain_cross"

/**
 * A copy of the migrations folder holding only what ran before `LINES_MIGRATION`, so a project can
 * be made at the shape it had then and carried forward by the real migrations afterwards.
 */
function migrationsBefore(dir: string): string {
  const folder = join(dir, "before")
  cpSync(migrationsFolder, folder, { recursive: true })
  const journalPath = join(folder, "meta", "_journal.json")
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { tag: string }[]
  }
  const at = journal.entries.findIndex((entry) => entry.tag === LINES_MIGRATION)
  if (at === -1) {
    throw new Error(`${LINES_MIGRATION} is not in the journal`)
  }
  journal.entries = journal.entries.slice(0, at)
  writeFileSync(journalPath, JSON.stringify(journal, null, 2))
  return folder
}

describe("the migration to one list of lines", () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-lines-"))
    path = join(dir, "project.db")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** A project holding one shot with two beats and one line of dialogue, as it was written then. */
  function projectWithBeatsAndDialogue(): void {
    const before = openProjectDatabase(path, migrationsBefore(dir))
    before.close()

    const sqlite = new Database(path)
    sqlite.exec(`
      INSERT INTO clips (id, name, target, style, note, music_note, created_at)
        VALUES (1, 'Lighthouse', 'minimax-h3', 'Live-action', '', '', 0);
      INSERT INTO shots (id, clip_id, position, duration_ms, sound_note)
        VALUES (1, 1, 0, 4000, '');
      INSERT INTO speakers (id, clip_id, position, description)
        VALUES (1, 1, 0, 'The keeper');
      INSERT INTO shot_beats (shot_id, position, text)
        VALUES (1, 0, 'climbs the last steps'), (1, 1, 'reaches for the lamp');
      INSERT INTO dialogue_lines (shot_id, speaker_ids, position, language, text)
        VALUES (1, '[1]', 0, 'English', 'Almost there.');
    `)
    sqlite.close()
  }

  it("carries the beats over as actions and the dialogue as speech", () => {
    projectWithBeatsAndDialogue()

    const handle = openProjectDatabase(path, migrationsFolder)
    const lines = handle.db.select().from(schema.shotLines).all()

    expect(lines.map((line) => [line.position, line.kind, line.text])).toEqual([
      [0, "action", "climbs the last steps"],
      [1, "action", "reaches for the lamp"],
      [2, "speech", "Almost there."],
    ])
    expect(lines[2].language).toBe("English")
    handle.close()
  })

  it("gives a clip the language its dialogue was written in by default", () => {
    projectWithBeatsAndDialogue()

    const handle = openProjectDatabase(path, migrationsFolder)

    expect(handle.db.select().from(schema.clips).all()[0].language).toBe("English")
    handle.close()
  })

  it("leaves the tables it replaced behind", () => {
    projectWithBeatsAndDialogue()

    const handle = openProjectDatabase(path, migrationsFolder)
    handle.close()

    const sqlite = new Database(path)
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string
    }[]
    sqlite.close()

    expect(tables.map((table) => table.name)).not.toContain("shot_beats")
    expect(tables.map((table) => table.name)).not.toContain("dialogue_lines")
  })
})
