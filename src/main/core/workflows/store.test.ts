import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import { WorkflowError } from "./errors"
import { fixtureText } from "./fixtures"
import { readGraph, scanGraph, type WorkflowGraph } from "./scan"
import {
  applySourceUpdate,
  checkSource,
  importWorkflow,
  listWorkflows,
  readWorkflow,
  readWorkflowSlots,
  setSlotTier,
  type WorkflowDetail,
} from "./store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("workflow store", () => {
  let dir: string
  let folder: string
  let sourcePath: string
  let handle: ProjectDatabaseHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-workflows-"))
    folder = join(dir, "workflows")
    mkdirSync(folder)
    sourcePath = join(folder, "h3-r2v-base.json")
    writeFileSync(sourcePath, fixtureText("h3-r2v-base"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function imported(): WorkflowDetail {
    return importWorkflow(handle.db, { folder, sourcePath })
  }

  /** Saves the source again the way ComfyUI would, after `edit` has changed its graph. */
  function editSource(edit: (graph: WorkflowGraph) => void): void {
    const graph = readGraph(sourcePath, readFileSync(sourcePath, "utf8"))
    edit(graph)
    writeFileSync(sourcePath, JSON.stringify(graph, null, 2))
  }

  function slotNamed(workflow: WorkflowDetail, name: string): WorkflowDetail["slots"][number] {
    const slot = workflow.slots.find((entry) => entry.name === name)
    if (!slot) throw new Error(`no slot ${name}`)
    return slot
  }

  function changedHash(workflowId: number): string {
    const status = checkSource(handle.db, workflowId)
    if (status.state !== "changed") throw new Error(`source is ${status.state}`)
    return status.contentHash
  }

  it("copies the file in under its stem, with the slots and guide its scan finds", () => {
    const workflow = imported()
    const scan = scanGraph(readGraph(sourcePath, fixtureText("h3-r2v-base")))

    expect(workflow.name).toBe("h3-r2v-base")
    expect(workflow.sourcePath).toBe(sourcePath)
    expect(workflow.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(
      workflow.slots.map((slot) => ({
        nodeId: slot.nodeId,
        nodeType: slot.nodeType,
        name: slot.name,
        kind: slot.kind,
        tier: slot.tier,
        bypassed: slot.bypassed,
        position: slot.position,
      }))
    ).toEqual(scan.slots)
    expect(workflow.guide).toEqual(scan.guide)
    expect(listWorkflows(handle.db).map((entry) => entry.name)).toEqual(["h3-r2v-base"])
  })

  it("leaves the source file exactly as it was", () => {
    const before = statSync(sourcePath).mtimeMs
    const workflow = imported()
    checkSource(handle.db, workflow.id)

    expect(readFileSync(sourcePath, "utf8")).toBe(fixtureText("h3-r2v-base"))
    expect(statSync(sourcePath).mtimeMs).toBe(before)
  })

  it("refuses a file it has already imported", () => {
    imported()

    expect(() => imported()).toThrow(expect.objectContaining({ code: "already-imported" }))
  })

  it("refuses a file outside the workflows folder", () => {
    const outside = join(dir, "elsewhere.json")
    writeFileSync(outside, fixtureText("h3-r2v-base"))

    expect(() => importWorkflow(handle.db, { folder, sourcePath: outside })).toThrow(
      /not in the workflows folder/
    )
  })

  it("refuses a file that is not a workflow and stores nothing", () => {
    writeFileSync(sourcePath, "not json")

    expect(() => imported()).toThrow(WorkflowError)
    expect(listWorkflows(handle.db)).toEqual([])
  })

  it("reads the slots alone as the detail lists them, and refuses a workflow that is not there", () => {
    const workflow = imported()

    expect(readWorkflowSlots(handle.db, workflow.id)).toEqual(workflow.slots)
    expect(() => readWorkflowSlots(handle.db, 999)).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
  })

  it("moves a slot to another tier", () => {
    const workflow = imported()
    const seed = slotNamed(workflow, "Seed")

    setSlotTier(handle.db, seed.id, "hidden")

    expect(slotNamed(readWorkflow(handle.db, workflow.id), "Seed").tier).toBe("hidden")
  })

  it("refuses a tier change for a slot that is not there", () => {
    expect(() => setSlotTier(handle.db, 999, "basic")).toThrow(/not in this project/)
  })

  it("says the source is in sync when it has not changed", () => {
    expect(checkSource(handle.db, imported().id)).toEqual({ state: "in-sync" })
  })

  it("says quietly that the source is gone, and the copy still reads", () => {
    const workflow = imported()
    rmSync(sourcePath)

    expect(checkSource(handle.db, workflow.id)).toEqual({ state: "missing" })
    expect(readWorkflow(handle.db, workflow.id).slots).toHaveLength(workflow.slots.length)
  })

  it("says the source cannot be read when it is half written", () => {
    const workflow = imported()
    writeFileSync(sourcePath, '{"nodes": [')

    expect(checkSource(handle.db, workflow.id)).toEqual(
      expect.objectContaining({ state: "unreadable" })
    )
  })

  it("shows what a changed source would change", () => {
    const workflow = imported()
    editSource((graph) => {
      const duration = graph.nodes.find((node) => node.id === 18)
      if (duration) duration.title = "Length (s)"
    })

    const status = checkSource(handle.db, workflow.id)

    expect(status.state).toBe("changed")
    if (status.state !== "changed") return
    expect(status.diff.renamed).toEqual([
      expect.objectContaining({ nodeId: 18, from: "Duration (s)", to: "Length (s)" }),
    ])
  })

  it("applies a change that touches no slot during the check, with no diff to decide on", () => {
    const workflow = imported()
    setSlotTier(handle.db, slotNamed(workflow, "Seed").id, "hidden")
    editSource((graph) => {
      graph.nodes.push({ id: 90, type: "SaveImage", title: "Output", mode: 0 })
    })

    expect(checkSource(handle.db, workflow.id)).toEqual({ state: "updated" })

    const updated = readWorkflow(handle.db, workflow.id)
    expect(updated.contentHash).not.toBe(workflow.contentHash)
    expect(updated.slots.map((slot) => slot.id)).toEqual(workflow.slots.map((slot) => slot.id))
    expect(slotNamed(updated, "Seed").tier).toBe("hidden")
    expect(checkSource(handle.db, workflow.id)).toEqual({ state: "in-sync" })
  })

  it("leaves a change that renames, adds or removes a slot waiting for Apply", () => {
    const workflow = imported()
    editSource((graph) => {
      graph.nodes = graph.nodes.filter((node) => node.id !== 21)
    })

    const status = checkSource(handle.db, workflow.id)

    expect(status.state).toBe("changed")
    expect(readWorkflow(handle.db, workflow.id).contentHash).toBe(workflow.contentHash)
    expect(readWorkflow(handle.db, workflow.id).slots).toHaveLength(workflow.slots.length)
  })

  it("keeps a tier the user chose across an applied update, and takes the rest of the change", () => {
    const workflow = imported()
    setSlotTier(handle.db, slotNamed(workflow, "Duration (s)").id, "hidden")
    setSlotTier(handle.db, slotNamed(workflow, "Seed").id, "advanced")
    editSource((graph) => {
      const duration = graph.nodes.find((node) => node.id === 18)
      if (duration) duration.title = "Length (s)"
      graph.nodes = graph.nodes.filter((node) => node.id !== 21)
      graph.nodes.push({ id: 33, type: "LoadAudio", title: "Voice", mode: 0 })
    })

    const updated = applySourceUpdate(handle.db, workflow.id, changedHash(workflow.id))

    expect(slotNamed(updated, "Length (s)")).toEqual(
      expect.objectContaining({ id: slotNamed(workflow, "Duration (s)").id, tier: "hidden" })
    )
    expect(slotNamed(updated, "Seed").tier).toBe("advanced")
    expect(updated.slots.map((slot) => slot.name)).not.toContain("Turbo steps")
    expect(slotNamed(updated, "Voice")).toEqual(
      expect.objectContaining({ kind: "audio", tier: "basic", nodeId: 33 })
    )
    expect(updated.contentHash).not.toBe(workflow.contentHash)
    expect(checkSource(handle.db, workflow.id)).toEqual({ state: "in-sync" })
  })

  it("refuses an update when the source changed again after its changes were shown", () => {
    const workflow = imported()
    editSource((graph) => graph.nodes.push({ id: 33, type: "LoadAudio", title: "Voice", mode: 0 }))
    const shownHash = changedHash(workflow.id)
    editSource((graph) => graph.nodes.push({ id: 34, type: "LoadAudio", title: "Music", mode: 0 }))

    expect(() => applySourceUpdate(handle.db, workflow.id, shownHash)).toThrow(/changed again/)
    expect(readWorkflow(handle.db, workflow.id).contentHash).toBe(workflow.contentHash)
  })

  it("leaves the old snapshot and slots in place when an update fails part way", () => {
    const workflow = imported()
    setSlotTier(handle.db, slotNamed(workflow, "Seed").id, "hidden")
    const before = readWorkflow(handle.db, workflow.id)
    editSource((graph) => {
      const seed = graph.nodes.find((node) => node.id === 23)
      if (seed) seed.title = "Noise seed"
      graph.nodes.push({ id: 33, type: "LoadAudio", title: "Voice", mode: 0 })
    })
    // The added slot is written last, after the snapshot and the renames, so failing it there
    // shows whether everything before it is undone.
    handle.db.run(
      sql`CREATE TRIGGER refuse_slots BEFORE INSERT ON workflow_slots BEGIN SELECT RAISE(ABORT, 'refused'); END`
    )

    expect(() => applySourceUpdate(handle.db, workflow.id, changedHash(workflow.id))).toThrow(
      /refused/
    )

    const after = readWorkflow(handle.db, workflow.id)
    expect(after).toEqual(before)
    expect(
      handle.db.get<{ graph: string }>(sql`SELECT graph FROM workflows WHERE id = ${workflow.id}`)
        .graph
    ).toBe(fixtureText("h3-r2v-base"))
  })
})
