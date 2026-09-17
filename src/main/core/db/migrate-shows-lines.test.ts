import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema } from "."

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** The migration that moved what a shot shows into its lines. */
const SHOWS_MIGRATION = "0011_daily_warhawk"

/** A copy of the migrations folder holding only what ran before `SHOWS_MIGRATION`. */
function migrationsBefore(dir: string): string {
  const folder = join(dir, "before")
  cpSync(migrationsFolder, folder, { recursive: true })
  const journalPath = join(folder, "meta", "_journal.json")
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] }
  const at = journal.entries.findIndex((entry) => entry.tag === SHOWS_MIGRATION)
  if (at === -1) {
    throw new Error(`${SHOWS_MIGRATION} is not in the journal`)
  }
  journal.entries = journal.entries.slice(0, at)
  writeFileSync(journalPath, JSON.stringify(journal, null, 2))
  return folder
}

describe("the migration that moves what a shot shows into its lines", () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-shows-"))
    path = join(dir, "project.db")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /**
   * A clip whose shot shows two library subjects and already has lines of its own, where one of
   * those subjects is also in the clip's cast under the same name. Beside it, a saved shot holding
   * a library subject of its own.
   */
  function projectBeforeTheMigration(): void {
    const before = openProjectDatabase(path, migrationsBefore(dir))
    before.close()

    const sqlite = new Database(path)
    sqlite.exec(`
      INSERT INTO clips (id, name, target, style, note, music_note, created_at)
        VALUES (1, 'One', 'minimax-h3', 'Live-action', '', '', 0);
      INSERT INTO assets (id, clip_id, kind, name, description, created_at)
        VALUES (1, NULL, 'person', 'Keeper', 'an elderly man', 0),
               (2, NULL, 'place', 'Lamp room', 'a cramped lamp room', 0),
               (3, 1, 'person', 'Keeper', 'an elderly man in oilskins', 0),
               (4, NULL, 'object', 'Lamp', 'a brass lamp', 0);
      INSERT INTO shots (id, clip_id, name, position, duration_ms, sound_note)
        VALUES (1, 1, NULL, 0, 4000, ''), (2, NULL, 'Establishing', 0, 4000, '');
      INSERT INTO shot_assets (shot_id, asset_id, position)
        VALUES (1, 1, 0), (1, 2, 1), (2, 4, 0);
      INSERT INTO shot_lines (shot_id, position, kind, subject_ids, text)
        VALUES (1, 0, 'action', '[1]', 'climbs the last steps'),
               (1, 1, 'speech', '[1]', 'Almost there.');
    `)
    sqlite.close()
  }

  it("turns what a shot showed into lines in front of what already happened in it", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const lines = handle.db
      .select()
      .from(schema.shotLines)
      .all()
      .filter((line) => line.shotId === 1)
      .sort((one, other) => one.position - other.position)

    expect(lines.map((line) => [line.kind, line.text])).toEqual([
      ["shows", ""],
      ["shows", ""],
      ["action", "climbs the last steps"],
      ["speech", "Almost there."],
    ])
    handle.close()
  })

  it("keeps the order a shot showed things in", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const cast = handle.db.select().from(schema.assets).all()
    const lampRoom = cast.find((asset) => asset.clipId === 1 && asset.name === "Lamp room")
    const shows = handle.db
      .select()
      .from(schema.shotLines)
      .all()
      .filter((line) => line.shotId === 1 && line.kind === "shows")
      .sort((one, other) => one.position - other.position)

    expect(shows[0].subjectIds).toEqual([3])
    expect(shows[1].subjectIds).toEqual([lampRoom?.id])
    handle.close()
  })

  it("copies a library subject the clip used into the clip's own cast", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const assets = handle.db.select().from(schema.assets).all()
    const copied = assets.find((asset) => asset.clipId === 1 && asset.name === "Lamp room")

    expect(copied?.description).toBe("a cramped lamp room")
    expect(assets.filter((asset) => asset.id === 2)[0].clipId).toBeNull()
    handle.close()
  })

  it("uses the cast member already there rather than a second one of the same name", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const keepers = handle.db
      .select()
      .from(schema.assets)
      .all()
      .filter((asset) => asset.clipId === 1 && asset.name === "Keeper")

    expect(keepers).toHaveLength(1)
    expect(keepers[0].description).toBe("an elderly man in oilskins")
    handle.close()
  })

  it("repoints a line that named the library subject at the clip's own", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const lines = handle.db.select().from(schema.shotLines).all()

    expect(lines.find((line) => line.text === "climbs the last steps")?.subjectIds).toEqual([3])
    expect(lines.find((line) => line.text === "Almost there.")?.subjectIds).toEqual([3])
    handle.close()
  })

  it("leaves a saved shot pointing at the library subject saved beside it", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const saved = handle.db
      .select()
      .from(schema.shotLines)
      .all()
      .filter((line) => line.shotId === 2)

    expect(saved.map((line) => [line.kind, line.subjectIds])).toEqual([["shows", [4]]])
    handle.close()
  })
})
