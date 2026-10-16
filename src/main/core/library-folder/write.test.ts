import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { scanLibraryFolder } from "./scan"
import { writeLibraryEntry } from "./write"

describe("writeLibraryEntry", () => {
  let dir: string
  let library: string
  let pictures: string[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-library-write-"))
    library = join(dir, "library")
    mkdirSync(join(library, "characters"), { recursive: true })
    pictures = [join(dir, "1-abc.png"), join(dir, "1-def.JPG")]
    writeFileSync(pictures[0], "front")
    writeFileSync(pictures[1], "side")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("writes an entry folder with the pictures and the notes as entry.md", () => {
    const written = writeLibraryEntry({
      folder: library,
      kind: "characters",
      name: "Anna",
      notes: "A woman in a red coat. ",
      pictures,
    })

    const entry = join(library, "characters", "Anna")
    expect(written).toEqual({ path: entry })
    expect(readdirSync(entry).sort()).toEqual(["Anna-1.png", "Anna-2.jpg", "entry.md"])
    expect(readFileSync(join(entry, "Anna-1.png"), "utf8")).toBe("front")
    expect(readFileSync(join(entry, "entry.md"), "utf8")).toBe("A woman in a red coat.\n")
  })

  it("makes the kind folder when the kind is new", () => {
    writeLibraryEntry({
      folder: library,
      kind: "props",
      name: "Lamp",
      notes: "A lamp.",
      pictures: [],
    })

    expect(readdirSync(join(library, "props", "Lamp"))).toEqual(["entry.md"])
  })

  it("leaves nothing behind when a picture cannot be copied, so a retry succeeds", () => {
    const entry = {
      folder: library,
      kind: "characters",
      name: "Anna",
      notes: "A woman in a red coat.",
      pictures: [pictures[0], join(dir, "gone.png")],
    }

    expect(() => writeLibraryEntry(entry)).toThrow()
    expect(readdirSync(join(library, "characters"))).toEqual([])

    writeFileSync(join(dir, "gone.png"), "back")
    writeLibraryEntry(entry)
    expect(readdirSync(join(library, "characters"))).toEqual(["Anna"])
    expect(readdirSync(join(library, "characters", "Anna")).sort()).toEqual([
      "Anna-1.png",
      "Anna-2.png",
      "entry.md",
    ])
  })

  it("removes a kind folder it made when the entry cannot be written", () => {
    expect(() =>
      writeLibraryEntry({
        folder: library,
        kind: "props",
        name: "Lamp",
        notes: "A lamp.",
        pictures: [join(dir, "gone.png")],
      })
    ).toThrow()

    expect(readdirSync(library)).toEqual(["characters"])
  })

  it("never lists a half-written entry, and writes beside one left by a crash", () => {
    const leftover = join(library, "characters", ".Anna.partial-abc123")
    mkdirSync(leftover)
    writeFileSync(join(leftover, "Anna-1.png"), "half")

    writeLibraryEntry({ folder: library, kind: "characters", name: "Anna", notes: "", pictures })

    const listing = scanLibraryFolder(library)
    if (listing.state !== "listed") throw new Error("the library is not listed")
    expect(listing.kinds[0].entries.map((entry) => entry.name)).toEqual(["Anna"])
  })

  it("refuses an entry that is already there and leaves it as it was", () => {
    mkdirSync(join(library, "characters", "Anna"))
    writeFileSync(join(library, "characters", "Anna", "entry.md"), "Kept.\n")

    expect(() =>
      writeLibraryEntry({
        folder: library,
        kind: "characters",
        name: "Anna",
        notes: "New.",
        pictures,
      })
    ).toThrow(expect.objectContaining({ code: "exists" }))
    expect(readdirSync(join(library, "characters", "Anna"))).toEqual(["entry.md"])
    expect(readFileSync(join(library, "characters", "Anna", "entry.md"), "utf8")).toBe("Kept.\n")
  })

  it("refuses a file of the entry's name too", () => {
    writeFileSync(join(library, "characters", "Anna"), "")

    expect(() =>
      writeLibraryEntry({ folder: library, kind: "characters", name: "Anna", notes: "x", pictures })
    ).toThrow(expect.objectContaining({ code: "exists" }))
  })

  it("refuses names that are not a single folder", () => {
    for (const [kind, name] of [
      ["characters", "../Anna"],
      ["characters", "a/b"],
      ["characters", ".hidden"],
      ["characters", "  "],
      ["..", "Anna"],
      ["a\\b", "Anna"],
    ]) {
      expect(() =>
        writeLibraryEntry({ folder: library, kind, name, notes: "x", pictures: [] })
      ).toThrow(expect.objectContaining({ code: "bad-name" }))
    }
    expect(readdirSync(library)).toEqual(["characters"])
  })

  it("refuses a kind that is a link, so nothing is written outside the folder", () => {
    const outside = join(dir, "outside")
    mkdirSync(outside)
    symlinkSync(outside, join(library, "linked"))

    expect(() =>
      writeLibraryEntry({ folder: library, kind: "linked", name: "Anna", notes: "x", pictures })
    ).toThrow(expect.objectContaining({ code: "bad-name" }))
    expect(readdirSync(outside)).toEqual([])
  })

  it("refuses when no folder is set or the folder is not there", () => {
    expect(() =>
      writeLibraryEntry({ folder: null, kind: "characters", name: "Anna", notes: "x", pictures })
    ).toThrow(expect.objectContaining({ code: "unset" }))
    expect(() =>
      writeLibraryEntry({
        folder: join(dir, "gone"),
        kind: "characters",
        name: "Anna",
        notes: "x",
        pictures,
      })
    ).toThrow(expect.objectContaining({ code: "missing" }))
    expect(existsSync(join(dir, "gone"))).toBe(false)
  })
})
