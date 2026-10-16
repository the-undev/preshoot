import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isInsideFolder, listWorkflowFolder } from "./folder"

describe("listWorkflowFolder", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-folder-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("says when no folder is set", () => {
    expect(listWorkflowFolder(null, [])).toEqual({ state: "unset" })
  })

  it("says when the folder is not there", () => {
    const folder = join(dir, "gone")

    expect(listWorkflowFolder(folder, [])).toEqual({ state: "missing", folder })
  })

  it("lists the json files under the folder and its subfolders, by where they sit", () => {
    mkdirSync(join(dir, "Base"))
    mkdirSync(join(dir, ".trash"))
    writeFileSync(join(dir, "Base", "h3-r2v-base.json"), "{}")
    writeFileSync(join(dir, "edit.json"), "{}")
    writeFileSync(join(dir, "notes.md"), "")
    writeFileSync(join(dir, ".hidden.json"), "{}")
    writeFileSync(join(dir, ".trash", "old.json"), "{}")

    expect(listWorkflowFolder(dir, [])).toEqual({
      state: "listed",
      folder: dir,
      files: [
        {
          name: "h3-r2v-base",
          path: join(dir, "Base", "h3-r2v-base.json"),
          relativePath: join("Base", "h3-r2v-base.json"),
          importedWorkflowId: null,
        },
        {
          name: "edit",
          path: join(dir, "edit.json"),
          relativePath: "edit.json",
          importedWorkflowId: null,
        },
      ],
    })
  })

  it("marks the files the project already holds a copy of", () => {
    writeFileSync(join(dir, "edit.json"), "{}")
    writeFileSync(join(dir, "other.json"), "{}")

    const listing = listWorkflowFolder(dir, [{ id: 4, sourcePath: join(dir, "edit.json") }])

    expect(
      listing.state === "listed" && listing.files.map((file) => file.importedWorkflowId)
    ).toEqual([4, null])
  })

  it("does not walk a link to a folder", () => {
    mkdirSync(join(dir, "inner"))
    writeFileSync(join(dir, "inner", "edit.json"), "{}")
    symlinkSync(dir, join(dir, "inner", "loop"))

    const listing = listWorkflowFolder(dir, [])

    expect(listing.state === "listed" && listing.files.map((file) => file.relativePath)).toEqual([
      join("inner", "edit.json"),
    ])
  })
})

describe("isInsideFolder", () => {
  it("takes a file in the folder or below it", () => {
    expect(isInsideFolder("/w", "/w/a.json")).toBe(true)
    expect(isInsideFolder("/w", "/w/Base/a.json")).toBe(true)
    expect(isInsideFolder("/w", "/w/..a.json")).toBe(true)
  })

  it("refuses the folder itself and anything outside it", () => {
    expect(isInsideFolder("/w", "/w")).toBe(false)
    expect(isInsideFolder("/w", "/w/../x.json")).toBe(false)
    expect(isInsideFolder("/w", "/other/a.json")).toBe(false)
  })
})
