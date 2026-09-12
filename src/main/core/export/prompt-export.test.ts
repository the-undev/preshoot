import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promptFileName, writePromptFiles } from "./prompt-export"

describe("promptFileName", () => {
  it("puts the clip and the time in one safe word run", () => {
    expect(promptFileName({ clipName: "Lamp room!", createdAt: "2026-09-12T08:00:00.000Z" })).toBe(
      "lamp-room-2026-09-12T08-00-00-000"
    )
  })

  it("falls back when the clip name has nothing usable in it", () => {
    expect(promptFileName({ clipName: "!!!", createdAt: "2026-09-12T08:00:00.000Z" })).toBe(
      "prompt-2026-09-12T08-00-00-000"
    )
  })
})

describe("writePromptFiles", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-export-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("writes the prompt on its own and its metadata beside it", () => {
    const written = writePromptFiles({
      directory: join(dir, "exports", "prompts"),
      baseName: "lighthouse",
      rendered: "integrated_multimodal_description: [Shot 1] ...",
      meta: { model: "Qwen3.5-9B" },
      pictures: [],
    })

    expect(readFileSync(written.textPath, "utf8")).toBe(
      "integrated_multimodal_description: [Shot 1] ...\n"
    )
    expect(JSON.parse(readFileSync(written.metaPath, "utf8"))).toEqual({
      model: "Qwen3.5-9B",
      pictures: [],
    })
  })

  it("copies the pictures the prompt names beside it, and lists them", () => {
    const source = join(dir, "keeper.png")
    writeFileSync(source, "not really a picture", "utf8")

    const written = writePromptFiles({
      directory: join(dir, "exports"),
      baseName: "lighthouse",
      rendered: "a prompt",
      meta: {},
      pictures: [{ role: "first", sourcePath: source, extension: ".png" }],
    })

    expect(written.picturePaths).toEqual([join(dir, "exports", "lighthouse-first.png")])
    expect(existsSync(written.picturePaths[0])).toBe(true)
    expect(JSON.parse(readFileSync(written.metaPath, "utf8")).pictures).toEqual([
      "lighthouse-first.png",
    ])
  })

  it("makes the directory when it is not there yet", () => {
    const written = writePromptFiles({
      directory: join(dir, "deep", "down"),
      baseName: "lighthouse",
      rendered: "a prompt",
      meta: {},
      pictures: [],
    })

    expect(written.textPath).toBe(join(dir, "deep", "down", "lighthouse.txt"))
  })
})
