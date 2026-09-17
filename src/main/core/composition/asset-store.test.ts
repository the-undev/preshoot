import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import {
  copyAsset,
  deleteAsset,
  insertAsset,
  listCast,
  listSavedAssets,
  updateAsset,
} from "./asset-store"
import { insertClip, insertShot, readComposition, setShotLines } from "./clip-store"
import type { LineInput } from "./clip-store"

/** One line as the editor sends it, with everything the caller does not care about filled in. */
function line(over: Partial<LineInput>): LineInput {
  return {
    kind: "action",
    subjectIds: [],
    text: "",
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
    ...over,
  }
}

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("asset store", () => {
  let dir: string
  let handle: ProjectDatabaseHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-assets-"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function keeper(): ReturnType<typeof insertAsset> {
    return insertAsset(handle.db, {
      clipId: null,
      kind: "person",
      name: "Keeper",
      description: "an elderly man in oilskins",
    })
  }

  it("lists nothing in a fresh project", () => {
    expect(listSavedAssets(handle.db)).toEqual([])
  })

  it("returns what it stored", () => {
    const stored = keeper()

    expect(stored.id).toBeGreaterThan(0)
    expect(stored.name).toBe("Keeper")
    expect(Date.parse(stored.createdAt)).not.toBeNaN()
  })

  it("lists by kind then name", () => {
    insertAsset(handle.db, {
      clipId: null,
      kind: "place",
      name: "Tower",
      description: "a lamp room",
    })
    insertAsset(handle.db, {
      clipId: null,
      kind: "object",
      name: "Lamp",
      description: "brass and glass",
    })
    keeper()

    expect(listSavedAssets(handle.db).map((asset) => asset.name)).toEqual([
      "Lamp",
      "Keeper",
      "Tower",
    ])
  })

  it("rewrites a name and a description", () => {
    const stored = keeper()

    const changed = updateAsset(handle.db, {
      id: stored.id,
      kind: "person",
      name: "Lighthouse keeper",
      description: "weathered, in oilskins",
      voice: "low and slow",
    })

    expect(changed.name).toBe("Lighthouse keeper")
    expect(changed.voice).toBe("low and slow")
  })

  it("refuses to rewrite a thing that is not there", () => {
    expect(() =>
      updateAsset(handle.db, { id: 99, kind: "person", name: "x", description: "y", voice: null })
    ).toThrow(expect.objectContaining({ code: "not-found" }))
  })

  it("removes a thing no shot shows", () => {
    const stored = keeper()

    deleteAsset(handle.db, dir, stored.id)

    expect(listSavedAssets(handle.db)).toEqual([])
  })

  it("takes a subject out of the shots that showed it", () => {
    const clip = insertClip(handle.db, {
      name: "Lighthouse",
      target: "minimax-h3",
      style: "Live-action",
    })
    const subject = insertAsset(handle.db, {
      clipId: clip.id,
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })
    const shotId = insertShot(handle.db, clip.id, "the camera cuts to")
    setShotLines(handle.db, shotId, [line({ kind: "shows", subjectIds: [subject.id] })])

    deleteAsset(handle.db, dir, subject.id)

    expect(listCast(handle.db, clip.id)).toEqual([])
    expect(readComposition(handle.db, clip.id).shots[0].lines[0].subjectIds).toEqual([])
  })

  it("copies a saved subject into a clip, leaving the saved one alone", () => {
    const saved = keeper()
    const clip = insertClip(handle.db, {
      name: "Lighthouse",
      target: "minimax-h3",
      style: "Live-action",
    })

    const copy = copyAsset(handle.db, saved.id, clip.id)
    updateAsset(handle.db, {
      id: copy.id,
      kind: "person",
      name: "Keeper",
      description: "soaked through",
      voice: null,
    })

    expect(copy.id).not.toBe(saved.id)
    expect(listCast(handle.db, clip.id)[0].description).toBe("soaked through")
    expect(listSavedAssets(handle.db)[0].description).toBe("an elderly man in oilskins")
  })
})
