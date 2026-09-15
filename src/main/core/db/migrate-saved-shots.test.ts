import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema } from "."

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** The migration that made a shot savable, which rebuilds the table everything hangs off. */
const SAVED_SHOTS_MIGRATION = "0010_sturdy_tyger_tiger"

function migrationsBefore(dir: string): string {
  const folder = join(dir, "before")
  cpSync(migrationsFolder, folder, { recursive: true })
  const journalPath = join(folder, "meta", "_journal.json")
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] }
  const at = journal.entries.findIndex((entry) => entry.tag === SAVED_SHOTS_MIGRATION)
  if (at === -1) {
    throw new Error(`${SAVED_SHOTS_MIGRATION} is not in the journal`)
  }
  journal.entries = journal.entries.slice(0, at)
  writeFileSync(journalPath, JSON.stringify(journal, null, 2))
  return folder
}

describe("the migration that made a shot savable", () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-saved-shots-"))
    path = join(dir, "project.db")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** Everything that hangs off a shot, so a rebuild that cascades would be obvious. */
  it("keeps what hangs off a shot when the table is rebuilt", () => {
    const before = openProjectDatabase(path, migrationsBefore(dir))
    before.close()

    const sqlite = new Database(path)
    sqlite.exec(`
      INSERT INTO clips (id, name, target, style, note, music_note, created_at)
        VALUES (1, 'One', 'minimax-h3', 'Live-action', '', '', 0);
      INSERT INTO assets (id, clip_id, kind, name, description, created_at)
        VALUES (1, 1, 'person', 'Keeper', 'an elderly man', 0);
      INSERT INTO asset_images (id, asset_id, file_name, media_type, position, created_at)
        VALUES (1, 1, 'keeper.png', 'image/png', 0, 0);
      INSERT INTO shots (id, clip_id, position, duration_ms, sound_note)
        VALUES (1, 1, 0, 4000, 'wind');
      INSERT INTO shot_assets (shot_id, asset_id, position) VALUES (1, 1, 0);
      INSERT INTO shot_lines (shot_id, position, kind, subject_ids, text)
        VALUES (1, 0, 'action', '[1]', 'climbs the steps');
      INSERT INTO clip_frames (clip_id, image_id, role) VALUES (1, 1, 'first');
      INSERT INTO open_tabs (id, clip_id, position) VALUES (1, 1, 0);
    `)
    sqlite.close()

    const handle = openProjectDatabase(path, migrationsFolder)

    expect(handle.db.select().from(schema.shots).all()).toHaveLength(1)
    expect(handle.db.select().from(schema.shotLines).all()).toHaveLength(1)
    expect(handle.db.select().from(schema.shotAssets).all()).toHaveLength(1)
    expect(handle.db.select().from(schema.assetImages).all()).toHaveLength(1)
    expect(handle.db.select().from(schema.clipFrames).all()).toHaveLength(1)
    expect(handle.db.select().from(schema.openTabs).all()).toHaveLength(1)
    handle.close()
  })
})
