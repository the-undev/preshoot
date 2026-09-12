import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import { deleteAsset, insertAsset } from "./asset-store"
import {
  deleteImage,
  importImage,
  listAllImages,
  listImages,
  projectImagesPath,
  readImage,
} from "./image-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("image store", () => {
  let dir: string
  let handle: ProjectDatabaseHandle
  let assetId: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-images-"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
    assetId = insertAsset(handle.db, {
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    }).id
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function sourceFile(name: string): string {
    const path = join(dir, name)
    writeFileSync(path, "not really a picture", "utf8")
    return path
  }

  it("copies a picture into the project and keeps its type", () => {
    const image = importImage(handle.db, {
      directory: dir,
      assetId,
      sourcePath: sourceFile("keeper.PNG"),
    })

    expect(image.mediaType).toBe("image/png")
    expect(existsSync(join(projectImagesPath(dir), image.fileName))).toBe(true)
    expect(listImages(handle.db, assetId)).toEqual([image])
  })

  it("keeps both when the same file is added twice", () => {
    const path = sourceFile("keeper.png")

    importImage(handle.db, { directory: dir, assetId, sourcePath: path })
    importImage(handle.db, { directory: dir, assetId, sourcePath: path })

    expect(listImages(handle.db, assetId)).toHaveLength(2)
    expect(readdirSync(projectImagesPath(dir))).toHaveLength(2)
  })

  it("refuses a file that is not a picture", () => {
    expect(() =>
      importImage(handle.db, { directory: dir, assetId, sourcePath: sourceFile("notes.txt") })
    ).toThrow(expect.objectContaining({ code: "not-found" }))
  })

  it("refuses a thing that is not there", () => {
    expect(() =>
      importImage(handle.db, { directory: dir, assetId: 99, sourcePath: sourceFile("a.png") })
    ).toThrow(expect.objectContaining({ code: "not-found" }))
  })

  it("says where a picture's file is", () => {
    const image = importImage(handle.db, {
      directory: dir,
      assetId,
      sourcePath: sourceFile("keeper.png"),
    })

    const read = readImage(handle.db, dir, image.id)

    expect(read.path).toBe(join(projectImagesPath(dir), image.fileName))
    expect(read.image.mediaType).toBe("image/png")
  })

  it("takes the file with the picture", () => {
    const image = importImage(handle.db, {
      directory: dir,
      assetId,
      sourcePath: sourceFile("keeper.png"),
    })

    deleteImage(handle.db, dir, image.id)

    expect(listImages(handle.db, assetId)).toEqual([])
    expect(existsSync(join(projectImagesPath(dir), image.fileName))).toBe(false)
  })

  it("takes every picture with the thing they belong to", () => {
    importImage(handle.db, { directory: dir, assetId, sourcePath: sourceFile("one.png") })
    importImage(handle.db, { directory: dir, assetId, sourcePath: sourceFile("two.png") })

    deleteAsset(handle.db, dir, assetId)

    expect(listAllImages(handle.db)).toEqual([])
    expect(readdirSync(projectImagesPath(dir))).toEqual([])
  })
})
