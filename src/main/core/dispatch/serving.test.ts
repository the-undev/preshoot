import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { byteRange, outputMediaType, resolveOutputFile } from "./serving"

describe("outputMediaType", () => {
  it("serves pictures, video and sound as what they are, whatever the case", () => {
    expect(outputMediaType("outputs/run-1/frame.PNG")).toBe("image/png")
    expect(outputMediaType("outputs/run-1/clip.mp4")).toBe("video/mp4")
    expect(outputMediaType("outputs/run-1/clip.webm")).toBe("video/webm")
    expect(outputMediaType("outputs/run-1/voice.wav")).toBe("audio/wav")
    expect(outputMediaType("outputs/run-1/voice.mp3")).toBe("audio/mpeg")
  })

  it("serves anything else as plain bytes", () => {
    expect(outputMediaType("outputs/run-1/latent.safetensors")).toBe("application/octet-stream")
    expect(outputMediaType("outputs/run-1/noextension")).toBe("application/octet-stream")
  })
})

describe("byteRange", () => {
  it("gives the whole file when nothing is asked for or the header cannot be read", () => {
    expect(byteRange(null, 100)).toEqual({ kind: "whole" })
    expect(byteRange("bytes=-", 100)).toEqual({ kind: "whole" })
    expect(byteRange("items=0-10", 100)).toEqual({ kind: "whole" })
    expect(byteRange("bytes=0-10,20-30", 100)).toEqual({ kind: "whole" })
    expect(byteRange("bytes=20-10", 100)).toEqual({ kind: "whole" })
  })

  it("gives a range with both ends", () => {
    expect(byteRange("bytes=10-19", 100)).toEqual({ kind: "part", start: 10, end: 19 })
  })

  it("runs an open range to the end of the file", () => {
    expect(byteRange("bytes=0-", 100)).toEqual({ kind: "part", start: 0, end: 99 })
    expect(byteRange("bytes=90-", 100)).toEqual({ kind: "part", start: 90, end: 99 })
  })

  it("stops a range that runs past the end at the end", () => {
    expect(byteRange("bytes=50-500", 100)).toEqual({ kind: "part", start: 50, end: 99 })
  })

  it("gives the last bytes for a suffix, or the whole file when it is shorter", () => {
    expect(byteRange("bytes=-10", 100)).toEqual({ kind: "part", start: 90, end: 99 })
    expect(byteRange("bytes=-500", 100)).toEqual({ kind: "part", start: 0, end: 99 })
  })

  it("refuses a range that starts past the end or asks for nothing", () => {
    expect(byteRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" })
    expect(byteRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" })
    expect(byteRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" })
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
