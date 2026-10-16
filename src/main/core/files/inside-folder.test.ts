import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resolveFileInside } from "./inside-folder"

describe("resolveFileInside", () => {
  let dir: string
  let library: string
  let outside: string

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "preshoot-inside-")))
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

  it("serves a file inside the folder", () => {
    expect(resolveFileInside(library, join("characters", "Daniel", "daniel.png"))).toBe(
      join(library, "characters", "Daniel", "daniel.png")
    )
  })

  it("refuses when the folder is not there", () => {
    expect(resolveFileInside(join(dir, "gone"), "daniel.png")).toBeNull()
  })

  it("refuses a path that climbs out of the folder", () => {
    expect(resolveFileInside(library, join("..", "outside", "secret.png"))).toBeNull()
    expect(
      resolveFileInside(library, join("characters", "..", "..", "outside", "secret.png"))
    ).toBeNull()
  })

  it("refuses an absolute path outside the folder", () => {
    expect(resolveFileInside(library, join(outside, "secret.png"))).toBeNull()
  })

  it("refuses a link inside the folder that leads out of it", () => {
    symlinkSync(join(outside, "secret.png"), join(library, "characters", "Daniel", "secret.png"))
    symlinkSync(outside, join(library, "elsewhere"))

    expect(resolveFileInside(library, join("characters", "Daniel", "secret.png"))).toBeNull()
    expect(resolveFileInside(library, join("elsewhere", "secret.png"))).toBeNull()
  })

  it("follows a folder that is itself a link", () => {
    const linked = join(dir, "linked")
    symlinkSync(library, linked)

    expect(resolveFileInside(linked, join("characters", "Daniel", "daniel.png"))).toBe(
      join(library, "characters", "Daniel", "daniel.png")
    )
  })

  it("refuses a folder, the folder itself, and a file that is not there", () => {
    expect(resolveFileInside(library, "characters")).toBeNull()
    expect(resolveFileInside(library, "")).toBeNull()
    expect(resolveFileInside(library, join("characters", "Anna.png"))).toBeNull()
  })
})
