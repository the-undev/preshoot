import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import { insertGeneration, listGenerations } from "./generation-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

const fields = {
  integrated_multimodal_description: "[Shot 1] Live-action, a baker opens the shutters.",
  overall_soundscape: "Wooden shutters scrape open over a quiet street.",
  non_diegetic_music: "A soft acoustic-guitar pattern at a moderate tempo.",
}

describe("generation store", () => {
  let dir: string
  let handle: ProjectDatabaseHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-generations-"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function store(brief: string): ReturnType<typeof insertGeneration> {
    return insertGeneration(handle.db, {
      target: "minimax-h3",
      composer: "brief",
      clipId: null,
      brief,
      fields,
      composition: null,
      prose: null,
      rendered: "integrated_multimodal_description: ...",
      model: "Qwen3.5-9B",
    })
  }

  it("lists nothing in a fresh project", () => {
    expect(listGenerations(handle.db, null)).toEqual([])
  })

  it("returns the stored generation with an id and a time", () => {
    const stored = store("A baker opens the shutters.")

    expect(stored.id).toBeGreaterThan(0)
    expect(stored.brief).toBe("A baker opens the shutters.")
    expect(stored.fields).toEqual(fields)
    expect(Date.parse(stored.createdAt)).not.toBeNaN()
  })

  it("lists the newest generation first", () => {
    store("First brief.")
    store("Second brief.")

    expect(listGenerations(handle.db, null).map((entry) => entry.brief)).toEqual([
      "Second brief.",
      "First brief.",
    ])
  })

  it("reads the fields back as an object", () => {
    store("A baker opens the shutters.")

    const [listed] = listGenerations(handle.db, null)
    expect(listed.fields.overall_soundscape).toBe(fields.overall_soundscape)
  })
})
