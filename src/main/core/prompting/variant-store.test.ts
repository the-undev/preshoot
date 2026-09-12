import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import { minimaxH3 } from "./targets/minimax-h3"
import {
  deleteVariant,
  insertVariant,
  listVariants,
  readVariant,
  updateVariant,
} from "./variant-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("variant store", () => {
  let dir: string
  let handle: ProjectDatabaseHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-variants-"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function write(name: string): ReturnType<typeof insertVariant> {
    return insertVariant(handle.db, {
      targetId: minimaxH3.id,
      strategy: "prose",
      name,
      systemPrompt: "Write it shorter.",
    })
  }

  it("lists the prompts the target ships with before anything is written", () => {
    const variants = listVariants(handle.db, minimaxH3)

    expect(variants.map((variant) => variant.id)).toEqual([
      "builtin:minimax-h3:prose",
      "builtin:minimax-h3:brief",
      "builtin:minimax-h3:edit",
    ])
    expect(variants.every((variant) => !variant.editable)).toBe(true)
    expect(variants[0].systemPrompt).toBe(minimaxH3.prose.systemPrompt)
  })

  it("lists what was written here after them", () => {
    const written = write("Terser")

    const variants = listVariants(handle.db, minimaxH3)
    expect(variants.map((variant) => variant.id)).toEqual([
      "builtin:minimax-h3:prose",
      "builtin:minimax-h3:brief",
      "builtin:minimax-h3:edit",
      written.id,
    ])
    expect(written.editable).toBe(true)
  })

  it("reads a prompt back by its id", () => {
    const written = write("Terser")

    expect(readVariant(handle.db, minimaxH3, written.id).systemPrompt).toBe("Write it shorter.")
    expect(readVariant(handle.db, minimaxH3, "builtin:minimax-h3:brief").systemPrompt).toBe(
      minimaxH3.brief.systemPrompt
    )
  })

  it("refuses a prompt that is not there", () => {
    expect(() => readVariant(handle.db, minimaxH3, "stored:99")).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
  })

  it("rewrites a prompt written here", () => {
    const written = write("Terser")

    const changed = updateVariant(handle.db, {
      id: written.id,
      name: "Much terser",
      systemPrompt: "Write it much shorter.",
    })

    expect(changed.name).toBe("Much terser")
    expect(readVariant(handle.db, minimaxH3, written.id).systemPrompt).toBe(
      "Write it much shorter."
    )
  })

  it("refuses to rewrite a prompt the target ships with", () => {
    expect(() =>
      updateVariant(handle.db, {
        id: "builtin:minimax-h3:prose",
        name: "Mine now",
        systemPrompt: "",
      })
    ).toThrow(expect.objectContaining({ code: "not-found" }))
  })

  it("removes a prompt written here and refuses to remove a built-in one", () => {
    const written = write("Terser")

    deleteVariant(handle.db, written.id)
    expect(listVariants(handle.db, minimaxH3)).toHaveLength(3)

    expect(() => deleteVariant(handle.db, "builtin:minimax-h3:prose")).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
  })
})
