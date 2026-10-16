import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resolveLibraryFile } from "./guard"

describe("resolveLibraryFile", () => {
  let dir: string
  let library: string

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "preshoot-guard-")))
    library = join(dir, "library")
    mkdirSync(join(library, "characters", "Daniel"), { recursive: true })
    writeFileSync(join(library, "characters", "Daniel", "daniel.png"), "")
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
})
