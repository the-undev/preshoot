import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema, type ProjectDatabaseHandle } from "../db"
import type { SlotBinding } from "../dispatch/dispatch"
import { recordRun } from "../dispatch/run-store"
import { fixtureText } from "../workflows/fixtures"
import { readGraph } from "../workflows/scan"
import {
  applySourceUpdate,
  checkSource,
  importWorkflow,
  type WorkflowDetail,
} from "../workflows/store"
import { ConfigurationError } from "./errors"
import {
  deleteConfiguration,
  duplicateConfiguration,
  listConfigurations,
  loadConfiguration,
  renameConfiguration,
  saveConfiguration,
  updateConfiguration,
} from "./store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")
const now = new Date(2026, 9, 16, 10, 0, 0)
const later = new Date(2026, 9, 16, 11, 0, 0)

describe("configuration store", () => {
  let dir: string
  let project: string
  let sourcePath: string
  let picture: string
  let handle: ProjectDatabaseHandle
  let workflow: WorkflowDetail

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-configurations-"))
    const folder = join(dir, "workflows")
    project = join(dir, "film")
    mkdirSync(folder)
    mkdirSync(project)
    sourcePath = join(folder, "h3-r2v-base.json")
    writeFileSync(sourcePath, fixtureText("h3-r2v-base"))
    picture = join(dir, "anna.png")
    writeFileSync(picture, Buffer.from([1, 2, 3]))
    handle = openProjectDatabase(join(project, "project.db"), migrationsFolder)
    workflow = importWorkflow(handle.db, { folder, sourcePath })
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function slotId(name: string): number {
    const slot = workflow.slots.find((entry) => entry.name === name)
    if (!slot) throw new Error(`no slot ${name}`)
    return slot.id
  }

  function formBindings(): SlotBinding[] {
    return [
      { slotId: slotId("Prompt"), on: true, value: { type: "value", value: "She turns." } },
      { slotId: slotId("Turbo steps"), on: true, value: { type: "value", value: 4 } },
      { slotId: slotId("Picture 1"), on: true, value: { type: "file", path: picture } },
    ]
  }

  function save(name: string, bindings = formBindings()): ReturnType<typeof saveConfiguration> {
    return saveConfiguration({
      db: handle.db,
      directory: project,
      workflowId: workflow.id,
      name,
      bindings,
      now,
    })
  }

  function storedPaths(configurationId: number): string[] {
    const row = handle.db
      .select()
      .from(schema.configurations)
      .all()
      .find((entry) => entry.id === configurationId)
    return (row?.bindings as { value: { type: string; path?: string } | null }[]).flatMap(
      (binding) => (binding.value?.type === "file" ? [binding.value.path as string] : [])
    )
  }

  /** Takes a source change that drops the Turbo steps node from the workflow. */
  function removeTurboSteps(): void {
    const graph = readGraph(sourcePath, readFileSync(sourcePath, "utf8"))
    graph.nodes = graph.nodes.filter((node) => node.id !== 21)
    writeFileSync(sourcePath, JSON.stringify(graph, null, 2))
    const status = checkSource(handle.db, workflow.id)
    if (status.state !== "changed") throw new Error("the source did not change")
    applySourceUpdate(handle.db, workflow.id, status.contentHash)
  }

  it("copies a bound file into the project's inputs and keeps its project path", () => {
    const saved = save("Anna at the window")

    expect(saved).toMatchObject({ name: "Anna at the window", staleSlotNames: [] })
    expect(storedPaths(saved.id)).toEqual(["inputs/anna.png"])
    expect(readFileSync(join(project, "inputs", "anna.png"))).toEqual(Buffer.from([1, 2, 3]))
  })

  it("keeps a second copy of the same file under its own name", () => {
    const first = save("First")
    const second = save("Second")

    expect(storedPaths(first.id)).toEqual(["inputs/anna.png"])
    expect(storedPaths(second.id)).toEqual(["inputs/anna-2.png"])
  })

  it("copies nothing in and saves nothing when a bound file cannot be read", () => {
    const missing = join(dir, "missing.png")

    expect(() =>
      save("Broken", [
        { slotId: slotId("Picture 1"), on: true, value: { type: "file", path: picture } },
        { slotId: slotId("Picture 2"), on: true, value: { type: "file", path: missing } },
      ])
    ).toThrow(ConfigurationError)
    expect(readdirSync(join(project, "inputs"))).toEqual([])
    expect(listConfigurations(handle.db, workflow.id)).toEqual([])
  })

  it("loads the bindings back with the copied file as a path the form can send", () => {
    const saved = save("Anna")

    const loaded = loadConfiguration(handle.db, project, saved.id)

    expect(loaded.configuration.staleSlotNames).toEqual([])
    expect(loaded.bindings).toEqual([
      { slotId: slotId("Prompt"), on: true, value: { type: "value", value: "She turns." } },
      { slotId: slotId("Turbo steps"), on: true, value: { type: "value", value: 4 } },
      {
        slotId: slotId("Picture 1"),
        on: true,
        value: { type: "file", path: join(project, "inputs", "anna.png") },
      },
    ])
  })

  it("names the slots a source update removed and loads what still matches", () => {
    const saved = save("Anna")
    removeTurboSteps()

    const loaded = loadConfiguration(handle.db, project, saved.id)

    expect(loaded.configuration.staleSlotNames).toEqual(["Turbo steps"])
    expect(loaded.bindings.map((binding) => binding.slotId)).toEqual([
      slotId("Prompt"),
      slotId("Picture 1"),
    ])
  })

  it("lists a workflow's configurations by name and marks the stale ones", () => {
    save("Zoe", [formBindings()[0]])
    save("Anna")
    removeTurboSteps()

    expect(
      listConfigurations(handle.db, workflow.id).map((entry) => [entry.name, entry.staleSlotNames])
    ).toEqual([
      ["Anna", ["Turbo steps"]],
      ["Zoe", []],
    ])
  })

  it("renames a configuration", () => {
    const saved = save("Anna")

    const renamed = renameConfiguration(handle.db, saved.id, "Anna, dusk", later)

    expect(renamed).toMatchObject({ id: saved.id, name: "Anna, dusk" })
    expect(renamed.updatedAt).toBe(later.toISOString())
    expect(() => renameConfiguration(handle.db, 999, "Nobody", later)).toThrow(/not in this/)
  })

  it("duplicates a configuration with copies of its files", () => {
    const saved = save("Anna")

    const copy = duplicateConfiguration({
      db: handle.db,
      directory: project,
      configurationId: saved.id,
      now: later,
    })

    expect(copy).toMatchObject({ name: "Anna copy", workflowId: workflow.id })
    expect(copy.id).not.toBe(saved.id)
    expect(storedPaths(copy.id)).toEqual(["inputs/anna-2.png"])
    expect(readFileSync(join(project, "inputs", "anna-2.png"))).toEqual(Buffer.from([1, 2, 3]))
    expect(loadConfiguration(handle.db, project, copy.id).bindings[0]).toEqual(
      loadConfiguration(handle.db, project, saved.id).bindings[0]
    )
  })

  it("deletes a configuration and the files only it names", () => {
    const saved = save("Anna")

    deleteConfiguration({ db: handle.db, directory: project, configurationId: saved.id })

    expect(listConfigurations(handle.db, workflow.id)).toEqual([])
    expect(existsSync(join(project, "inputs", "anna.png"))).toBe(false)
  })

  it("keeps a file another configuration names when one of them is deleted", () => {
    const first = save("Anna")
    // Saved as new from the loaded first one, so it names the same copy.
    const loaded = loadConfiguration(handle.db, project, first.id)
    const second = save("Anna again", loaded.bindings)
    expect(storedPaths(second.id)).toEqual(["inputs/anna.png"])

    deleteConfiguration({ db: handle.db, directory: project, configurationId: first.id })

    expect(existsSync(join(project, "inputs", "anna.png"))).toBe(true)
    expect(listConfigurations(handle.db, workflow.id).map((entry) => entry.name)).toEqual([
      "Anna again",
    ])
  })

  it("keeps a file a run was sent with, and unlinks the run from the deleted configuration", () => {
    const saved = save("Anna")
    const copied = join(project, "inputs", "anna.png")
    const run = recordRun(handle.db, {
      workflowId: workflow.id,
      configurationId: saved.id,
      promptId: "a1b2",
      apiPrompt: "{}",
      bindings: [
        { slotId: slotId("Picture 1"), slotName: "Picture 1", on: true, value: "x", file: copied },
      ],
      seed: null,
      createdAt: now,
    })

    deleteConfiguration({ db: handle.db, directory: project, configurationId: saved.id })

    expect(existsSync(copied)).toBe(true)
    const row = handle.db
      .select()
      .from(schema.runs)
      .all()
      .find((entry) => entry.id === run.id)
    expect(row?.configurationId).toBeNull()
  })

  it("updates a configuration's bindings and removes the file it no longer names", () => {
    const saved = save("Anna")
    const other = join(dir, "bea.png")
    writeFileSync(other, Buffer.from([4, 5]))

    const updated = updateConfiguration({
      db: handle.db,
      directory: project,
      configurationId: saved.id,
      bindings: [{ slotId: slotId("Picture 1"), on: true, value: { type: "file", path: other } }],
      now: later,
    })

    expect(updated.updatedAt).toBe(later.toISOString())
    expect(storedPaths(saved.id)).toEqual(["inputs/bea.png"])
    expect(existsSync(join(project, "inputs", "anna.png"))).toBe(false)
  })

  it("keeps a file an update still names without copying it again", () => {
    const saved = save("Anna")
    const loaded = loadConfiguration(handle.db, project, saved.id)

    updateConfiguration({
      db: handle.db,
      directory: project,
      configurationId: saved.id,
      bindings: loaded.bindings,
      now: later,
    })

    expect(storedPaths(saved.id)).toEqual(["inputs/anna.png"])
    expect(readdirSync(join(project, "inputs"))).toEqual(["anna.png"])
  })

  it("refuses a slot the workflow does not have", () => {
    expect(() => save("Nowhere", [{ slotId: 999, on: true, value: null }])).toThrow(
      /Slot 999 is not in this project/
    )
  })
})
