import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resolveLibraryFile } from "./guard"

describe("resolveLibraryFile", () => {
  let dir: string
  let library: string
  let outside: string

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "preshoot-guard-")))
    library = join(dir, "library")
    outside = join(dir, "outside")
    mkdirSync(join(library, "characters", "Daniel"), { recursive: true })
    mkdirSync(outside)
    writeFileSync(join(library, "characters", "Daniel", "daniel.png"), "")
    writeFileSync(join(outside, "secret.png"), "")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("serves a file inside the library folder", () => {
    expect(resolveLibraryFile(library, join("characters", "Daniel", "daniel.png"))).toBe(
      join(library, "characters", "Daniel", "daniel.png")
    )
  })

  it("refuses when no folder is set or the folder is not there", () => {
    expect(resolveLibraryFile(null, join("characters", "Daniel", "daniel.png"))).toBeNull()
    expect(resolveLibraryFile(join(dir, "gone"), "daniel.png")).toBeNull()
  })

  it("refuses a path that climbs out of the folder", () => {
    expect(resolveLibraryFile(library, join("..", "outside", "secret.png"))).toBeNull()
    expect(
      resolveLibraryFile(library, join("characters", "..", "..", "outside", "secret.png"))
    ).toBeNull()
  })

  it("refuses an absolute path outside the folder", () => {
    expect(resolveLibraryFile(library, join(outside, "secret.png"))).toBeNull()
  })

  it("refuses a link inside the folder that leads out of it", () => {
    symlinkSync(join(outside, "secret.png"), join(library, "characters", "Daniel", "secret.png"))
    symlinkSync(outside, join(library, "elsewhere"))

    expect(resolveLibraryFile(library, join("characters", "Daniel", "secret.png"))).toBeNull()
    expect(resolveLibraryFile(library, join("elsewhere", "secret.png"))).toBeNull()
  })

  it("follows a library folder that is itself a link", () => {
    const linked = join(dir, "linked")
    symlinkSync(library, linked)

    expect(resolveLibraryFile(linked, join("characters", "Daniel", "daniel.png"))).toBe(
      join(library, "characters", "Daniel", "daniel.png")
    )
  })

  it("refuses a folder, the library folder itself, and a file that is not there", () => {
    expect(resolveLibraryFile(library, "characters")).toBeNull()
    expect(resolveLibraryFile(library, "")).toBeNull()
    expect(resolveLibraryFile(library, join("characters", "Anna.png"))).toBeNull()
  })
})
