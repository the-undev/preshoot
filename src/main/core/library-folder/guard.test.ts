import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resolveLibraryFile, resolveOutputFile } from "./guard"

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

describe("resolveOutputFile", () => {
  let dir: string
  let project: string
  let outside: string

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "preshoot-output-guard-")))
    project = join(dir, "film")
    outside = join(dir, "outside")
    mkdirSync(join(project, "outputs", "run-1"), { recursive: true })
    mkdirSync(join(project, "assets"))
    mkdirSync(outside)
    writeFileSync(join(project, "outputs", "run-1", "clip.mp4"), "")
    writeFileSync(join(project, "project.db"), "")
    writeFileSync(join(project, "assets", "anna.png"), "")
    writeFileSync(join(outside, "secret.png"), "")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("serves a file inside the project's outputs folder", () => {
    expect(resolveOutputFile(project, "outputs/run-1/clip.mp4")).toBe(
      join(project, "outputs", "run-1", "clip.mp4")
    )
  })

  it("refuses when no project is open or its outputs folder is not there", () => {
    expect(resolveOutputFile(null, "outputs/run-1/clip.mp4")).toBeNull()
    rmSync(join(project, "outputs"), { recursive: true })
    expect(resolveOutputFile(project, "outputs/run-1/clip.mp4")).toBeNull()
  })

  it("refuses the rest of the project", () => {
    expect(resolveOutputFile(project, "project.db")).toBeNull()
    expect(resolveOutputFile(project, "assets/anna.png")).toBeNull()
  })

  it("refuses a path that climbs out of the outputs folder", () => {
    expect(resolveOutputFile(project, "outputs/../project.db")).toBeNull()
    expect(resolveOutputFile(project, "outputs/run-1/../../assets/anna.png")).toBeNull()
    expect(resolveOutputFile(project, "outputs/../../outside/secret.png")).toBeNull()
  })

  it("refuses an absolute path, inside the project or out of it", () => {
    expect(resolveOutputFile(project, join(outside, "secret.png"))).toBeNull()
    expect(resolveOutputFile(project, join(project, "project.db"))).toBeNull()
  })

  it("refuses a link inside the outputs folder that leads out of it", () => {
    symlinkSync(join(outside, "secret.png"), join(project, "outputs", "run-1", "secret.png"))
    symlinkSync(join(project, "project.db"), join(project, "outputs", "run-1", "project.db"))
    symlinkSync(outside, join(project, "outputs", "elsewhere"))

    expect(resolveOutputFile(project, "outputs/run-1/secret.png")).toBeNull()
    expect(resolveOutputFile(project, "outputs/run-1/project.db")).toBeNull()
    expect(resolveOutputFile(project, "outputs/elsewhere/secret.png")).toBeNull()
  })

  it("follows a project folder that is itself a link", () => {
    const linked = join(dir, "linked")
    symlinkSync(project, linked)

    expect(resolveOutputFile(linked, "outputs/run-1/clip.mp4")).toBe(
      join(project, "outputs", "run-1", "clip.mp4")
    )
  })

  it("refuses a folder, the outputs folder itself, and a file that is not there", () => {
    expect(resolveOutputFile(project, "outputs/run-1")).toBeNull()
    expect(resolveOutputFile(project, "outputs")).toBeNull()
    expect(resolveOutputFile(project, "")).toBeNull()
    expect(resolveOutputFile(project, "outputs/run-1/other.mp4")).toBeNull()
  })
})
