import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import { deleteAsset, insertAsset, listAssets, updateAsset } from "./asset-store"
import { insertClip, insertShot, setShotThings } from "./clip-store"

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
      kind: "person",
      name: "Keeper",
      description: "an elderly man in oilskins",
    })
  }

  it("lists nothing in a fresh project", () => {
    expect(listAssets(handle.db)).toEqual([])
  })

  it("returns what it stored", () => {
    const stored = keeper()

    expect(stored.id).toBeGreaterThan(0)
    expect(stored.name).toBe("Keeper")
    expect(Date.parse(stored.createdAt)).not.toBeNaN()
  })

  it("lists by kind then name", () => {
    insertAsset(handle.db, { kind: "place", name: "Tower", description: "a lamp room" })
    insertAsset(handle.db, { kind: "object", name: "Lamp", description: "brass and glass" })
    keeper()

    expect(listAssets(handle.db).map((asset) => asset.name)).toEqual(["Lamp", "Keeper", "Tower"])
  })

  it("rewrites a name and a description", () => {
    const stored = keeper()

    const changed = updateAsset(handle.db, {
      id: stored.id,
      kind: "person",
      name: "Lighthouse keeper",
      description: "weathered, in oilskins",
    })

    expect(changed.name).toBe("Lighthouse keeper")
    expect(changed.kind).toBe("person")
  })

  it("refuses to rewrite a thing that is not there", () => {
    expect(() =>
      updateAsset(handle.db, { id: 99, kind: "person", name: "x", description: "y" })
    ).toThrow(expect.objectContaining({ code: "not-found" }))
  })

  it("removes a thing no shot shows", () => {
    const stored = keeper()

    deleteAsset(handle.db, dir, stored.id)

    expect(listAssets(handle.db)).toEqual([])
  })

  it("refuses to remove a thing a shot still shows, naming the clip", () => {
    const stored = keeper()
    const clip = insertClip(handle.db, {
      name: "Lighthouse",
      target: "minimax-h3",
      style: "Live-action",
    })
    const shotId = insertShot(handle.db, clip.id)
    setShotThings(handle.db, shotId, [stored.id])

    expect(() => deleteAsset(handle.db, dir, stored.id)).toThrow(
      expect.objectContaining({ code: "in-use", message: expect.stringContaining("Lighthouse") })
    )
  })
})
