import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema } from "."

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** The migration that gave a clip its own cast and made the speakers part of it. */
const CAST_MIGRATION = "0008_unique_black_widow"

/** A copy of the migrations folder holding only what ran before `CAST_MIGRATION`. */
function migrationsBefore(dir: string): string {
  const folder = join(dir, "before")
  cpSync(migrationsFolder, folder, { recursive: true })
  const journalPath = join(folder, "meta", "_journal.json")
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] }
  const at = journal.entries.findIndex((entry) => entry.tag === CAST_MIGRATION)
  if (at === -1) {
    throw new Error(`${CAST_MIGRATION} is not in the journal`)
  }
  journal.entries = journal.entries.slice(0, at)
  writeFileSync(journalPath, JSON.stringify(journal, null, 2))
  return folder
}

describe("the migration to a cast the clip owns", () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-cast-"))
    path = join(dir, "project.db")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /**
   * Two clips sharing one library subject, one of them with a picture, a line about that subject
   * and a line spoken by a voice of its own.
   */
  function projectBeforeTheMigration(): void {
    const before = openProjectDatabase(path, migrationsBefore(dir))
    before.close()

    const sqlite = new Database(path)
    sqlite.exec(`
      INSERT INTO clips (id, name, target, style, note, music_note, created_at)
        VALUES (1, 'One', 'minimax-h3', 'Live-action', '', '', 0),
               (2, 'Two', 'minimax-h3', 'Live-action', '', '', 0);
      INSERT INTO assets (id, kind, name, description, created_at)
        VALUES (1, 'person', 'Keeper', 'an elderly man', 0);
      INSERT INTO asset_images (id, asset_id, file_name, media_type, position, created_at)
        VALUES (1, 1, 'keeper.png', 'image/png', 0, 0);
      INSERT INTO shots (id, clip_id, position, duration_ms, sound_note)
        VALUES (1, 1, 0, 4000, ''), (2, 2, 0, 4000, '');
      INSERT INTO shot_assets (shot_id, asset_id, position) VALUES (1, 1, 0), (2, 1, 0);
      INSERT INTO speakers (id, clip_id, position, asset_id, description)
        VALUES (1, 1, 0, 1, 'low and weathered'), (2, 1, 1, NULL, 'a voice on the radio');
      INSERT INTO shot_lines (shot_id, position, kind, asset_id, speaker_ids, text)
        VALUES (1, 0, 'action', 1, '[]', 'climbs the steps'),
               (1, 1, 'speech', NULL, '[1]', 'Almost there.'),
               (1, 2, 'speech', NULL, '[2]', 'Say again.');
      INSERT INTO clip_frames (clip_id, image_id, role) VALUES (1, 1, 'first');
    `)
    sqlite.close()
  }

  it("gives each clip its own copy of the subject it used, and leaves the library one alone", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const assets = handle.db.select().from(schema.assets).all()

    expect(assets.filter((asset) => asset.clipId === null).map((asset) => asset.name)).toEqual([
      "Keeper",
    ])
    expect(assets.filter((asset) => asset.clipId === 1 && asset.name === "Keeper")).toHaveLength(1)
    expect(assets.filter((asset) => asset.clipId === 2 && asset.name === "Keeper")).toHaveLength(1)
    handle.close()
  })

  it("copies the pictures onto each clip's own subject", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const pictures = handle.db.select().from(schema.assetImages).all()

    expect(pictures.filter((picture) => picture.fileName === "keeper.png")).toHaveLength(3)
    handle.close()
  })

  it("points a shot and a line at the clip's own subject rather than at the library one", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const own = handle.db
      .select()
      .from(schema.assets)
      .all()
      .find((asset) => asset.clipId === 1)
    const shown = handle.db.select().from(schema.shotAssets).all()
    const lines = handle.db.select().from(schema.shotLines).all()

    expect(own).toBeDefined()
    expect(shown.find((entry) => entry.shotId === 1)?.assetId).toBe(own?.id)
    expect(lines.find((line) => line.text === "climbs the steps")?.subjectIds).toEqual([own?.id])
    handle.close()
  })

  it("turns a voice that was a subject into that subject speaking", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const own = handle.db
      .select()
      .from(schema.assets)
      .all()
      .find((asset) => asset.clipId === 1)
    const lines = handle.db.select().from(schema.shotLines).all()

    expect(own?.voice).toBe("low and weathered")
    expect(lines.find((line) => line.text === "Almost there.")?.subjectIds).toEqual([own?.id])
    handle.close()
  })

  it("turns a voice that was nobody into a subject of the clip", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const radio = handle.db
      .select()
      .from(schema.assets)
      .all()
      .find((asset) => asset.voice === "a voice on the radio")
    const lines = handle.db.select().from(schema.shotLines).all()

    expect(radio?.clipId).toBe(1)
    expect(lines.find((line) => line.text === "Say again.")?.subjectIds).toEqual([radio?.id])
    handle.close()
  })

  it("points the clip's reference picture at its own copy", () => {
    projectBeforeTheMigration()

    const handle = openProjectDatabase(path, migrationsFolder)
    const frame = handle.db.select().from(schema.clipFrames).all()[0]
    const picture = handle.db
      .select()
      .from(schema.assetImages)
      .all()
      .find((entry) => entry.id === frame.imageId)
    const own = handle.db
      .select()
      .from(schema.assets)
      .all()
      .find((asset) => asset.clipId === 1)

    expect(picture?.assetId).toBe(own?.id)
    handle.close()
  })
})
