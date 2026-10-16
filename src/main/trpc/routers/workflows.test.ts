import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ClipHistory } from "../../core/composition/history"
import { schema } from "../../core/db"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import { fixtureText } from "../../core/workflows/fixtures"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("workflows router", () => {
  let dir: string
  let folder: string
  let sourcePath: string
  let session: ProjectSession
  let settings: AppSettingsStore
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-workflows-router-"))
    folder = join(dir, "workflows")
    mkdirSync(folder)
    sourcePath = join(folder, "h3-r2v-base.json")
    writeFileSync(sourcePath, fixtureText("h3-r2v-base"))
    session = new ProjectSession()
    settings = new AppSettingsStore(join(dir, "settings.json"))
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      history: new ClipHistory(),
      settings,
      migrationsFolder,
      dialogs: {
        pickDirectory: async () => null,
        pickFiles: async () => [],
        saveFile: async () => null,
      },
      openPath: async () => {},
      promptClient: () => {
        throw new Error("the workflows router does not generate prompts")
      },
      comfyUiClient: () => {
        throw new Error("the workflows router does not talk to ComfyUI")
      },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function openProject(): Promise<void> {
    await caller.projects.create({
      directory: join(dir, "film"),
      name: "Film",
      createDirectory: false,
      allowNonEmpty: false,
    })
  }

  it("asks for a project before listing anything", async () => {
    await expect(caller.workflows.files()).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("says when no workflows folder is set", async () => {
    await openProject()

    expect(await caller.workflows.files()).toEqual({ state: "unset" })
  })

  it("refuses an import before a folder is set", async () => {
    await openProject()

    await expect(caller.workflows.import({ path: sourcePath })).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("lists the folder, imports a file and marks it as imported", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)

    const { workflow: imported } = await caller.workflows.import({ path: sourcePath })
    const files = await caller.workflows.files()

    expect(files).toEqual({
      state: "listed",
      folder,
      files: [
        {
          name: "h3-r2v-base",
          path: sourcePath,
          relativePath: "h3-r2v-base.json",
          importedWorkflowId: imported.id,
        },
      ],
    })
    expect((await caller.workflows.list()).map((workflow) => workflow.name)).toEqual([
      "h3-r2v-base",
    ])
  })

  it("suggests a base on import only when another workflow shares enough slots", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    writeFileSync(join(folder, "h3-fl2v-base.json"), fixtureText("h3-fl2v-base"))
    writeFileSync(
      join(folder, "qwen-edit-2511-edit-base.json"),
      fixtureText("qwen-edit-2511-edit-base")
    )

    const first = await caller.workflows.import({ path: sourcePath })
    const fl2v = await caller.workflows.import({ path: join(folder, "h3-fl2v-base.json") })
    const qwen = await caller.workflows.import({
      path: join(folder, "qwen-edit-2511-edit-base.json"),
    })

    expect(first.suggestion).toBeNull()
    expect(fl2v.suggestion).toEqual({
      workflowId: first.workflow.id,
      name: "h3-r2v-base",
      matchingSlots: 7,
    })
    expect(qwen.suggestion).toBeNull()
  })

  it("copies a base workflow's tiers, names and notes onto the matching slots", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    writeFileSync(join(folder, "h3-fl2v-base.json"), fixtureText("h3-fl2v-base"))
    const { workflow: base } = await caller.workflows.import({ path: sourcePath })
    const seed = base.slots.find((slot) => slot.name === "Seed")
    if (!seed) throw new Error("no seed slot")
    await caller.workflows.setTier({ slotId: seed.id, tier: "hidden" })
    await caller.workflows.setLabel({ slotId: seed.id, displayName: "Noise", note: "Keep it." })
    const { workflow: fresh } = await caller.workflows.import({
      path: join(folder, "h3-fl2v-base.json"),
    })

    const copied = await caller.workflows.copyMapping({
      workflowId: fresh.id,
      fromWorkflowId: base.id,
    })

    expect(copied.slots.find((slot) => slot.name === "Seed")).toEqual(
      expect.objectContaining({ tier: "hidden", displayName: "Noise", note: "Keep it." })
    )
  })

  it("reports a copy from a workflow that is not there as not found", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const { workflow } = await caller.workflows.import({ path: sourcePath })

    await expect(
      caller.workflows.copyMapping({ workflowId: workflow.id, fromWorkflowId: 99 })
    ).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }))
  })

  it("removes a workflow and lists its source as importable again", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const { workflow: imported } = await caller.workflows.import({ path: sourcePath })

    await caller.workflows.remove({ workflowId: imported.id })

    expect(await caller.workflows.list()).toEqual([])
    const files = await caller.workflows.files()
    if (files.state !== "listed") throw new Error("the folder was not listed")
    expect(files.files.map((file) => file.importedWorkflowId)).toEqual([null])
  })

  it("reports removing a workflow that is not there as not found", async () => {
    await openProject()

    await expect(caller.workflows.remove({ workflowId: 99 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })

  it("refuses the same file twice as a conflict", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    await caller.workflows.import({ path: sourcePath })

    await expect(caller.workflows.import({ path: sourcePath })).rejects.toThrow(
      expect.objectContaining({ code: "CONFLICT" })
    )
  })

  it("refuses a file outside the folder", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const outside = join(dir, "elsewhere.json")
    writeFileSync(outside, fixtureText("h3-r2v-base"))

    await expect(caller.workflows.import({ path: outside })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
  })

  it("reads a workflow back with its slots and guide, and moves a slot to another tier", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const { workflow: imported } = await caller.workflows.import({ path: sourcePath })
    const seed = imported.slots.find((slot) => slot.name === "Seed")
    if (!seed) throw new Error("no seed slot")

    await caller.workflows.setTier({ slotId: seed.id, tier: "hidden" })
    const workflow = await caller.workflows.get({ workflowId: imported.id })

    expect(workflow.slots.find((slot) => slot.id === seed.id)?.tier).toBe("hidden")
    expect(workflow.guide.map((note) => note.title)).toEqual(["How to use"])
  })

  it("gives a slot a display name and note, and clears them again", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const { workflow: imported } = await caller.workflows.import({ path: sourcePath })
    const seed = imported.slots.find((slot) => slot.name === "Seed")
    if (!seed) throw new Error("no seed slot")

    const labelled = await caller.workflows.setLabel({
      slotId: seed.id,
      displayName: "Noise seed",
      note: "Keep it fixed.",
    })
    expect(labelled).toEqual(
      expect.objectContaining({ name: "Seed", displayName: "Noise seed", note: "Keep it fixed." })
    )

    await caller.workflows.setLabel({ slotId: seed.id, displayName: "", note: "" })
    const workflow = await caller.workflows.get({ workflowId: imported.id })
    expect(workflow.slots.find((slot) => slot.id === seed.id)).toEqual(
      expect.objectContaining({ displayName: null, note: "" })
    )
  })

  it("reports a label for a slot that is not there as not found", async () => {
    await openProject()

    await expect(
      caller.workflows.setLabel({ slotId: 999, displayName: "Seed", note: "" })
    ).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }))
  })

  it("refuses a tier the mapping does not have", async () => {
    await openProject()

    await expect(
      caller.workflows.setTier({ slotId: 1, tier: "secret" as "hidden" })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("reports a workflow that is not there as not found", async () => {
    await openProject()

    await expect(caller.workflows.get({ workflowId: 99 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })

  it("shows a changed source and applies it when asked", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const { workflow: imported } = await caller.workflows.import({ path: sourcePath })
    expect(await caller.workflows.checkSource({ workflowId: imported.id })).toEqual({
      state: "in-sync",
    })
    writeFileSync(sourcePath, fixtureText("h3-r2v-base").replace('"Seed"', '"Noise seed"'))

    const status = await caller.workflows.checkSource({ workflowId: imported.id })
    if (status.state !== "changed") throw new Error(`source is ${status.state}`)
    expect(status.diff.renamed.map((slot) => [slot.from, slot.to])).toEqual([
      ["Seed", "Noise seed"],
    ])

    const updated = await caller.workflows.applyUpdate({
      workflowId: imported.id,
      contentHash: status.contentHash,
    })
    expect(updated.slots.map((slot) => slot.name)).toContain("Noise seed")
    expect(await caller.workflows.checkSource({ workflowId: imported.id })).toEqual({
      state: "in-sync",
    })
  })

  it("applies a source change that touches no slot during the check", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const { workflow: imported } = await caller.workflows.import({ path: sourcePath })
    const graph = JSON.parse(fixtureText("h3-r2v-base"))
    graph.nodes.push({ id: 90, type: "SaveImage", title: "Output", mode: 0 })
    writeFileSync(sourcePath, JSON.stringify(graph))

    expect(await caller.workflows.checkSource({ workflowId: imported.id })).toEqual({
      state: "updated",
    })
    expect((await caller.workflows.get({ workflowId: imported.id })).contentHash).not.toBe(
      imported.contentHash
    )
    expect(await caller.workflows.checkSource({ workflowId: imported.id })).toEqual({
      state: "in-sync",
    })
  })

  it("lists each workflow's shown text slots without reading its graph", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const { workflow: imported } = await caller.workflows.import({ path: sourcePath })
    const prompt = imported.slots.find((slot) => slot.name === "Prompt")
    if (!prompt) throw new Error("no Prompt slot")
    // A graph that cannot be read, which reading the full workflow refuses.
    const project = session.current()
    if (!project) throw new Error("no project open")
    project.db.update(schema.workflows).set({ graph: "{ not json" }).run()
    await expect(caller.workflows.get({ workflowId: imported.id })).rejects.toThrow()

    expect(await caller.workflows.textSlots()).toEqual([
      {
        id: imported.id,
        name: "h3-r2v-base",
        slots: [
          { id: prompt.id, name: "Prompt", displayName: null, multiline: true, tier: "basic" },
        ],
      },
    ])
    await caller.workflows.setTier({ slotId: prompt.id, tier: "hidden" })
    expect(await caller.workflows.textSlots()).toEqual([
      { id: imported.id, name: "h3-r2v-base", slots: [] },
    ])
  })

  it("refuses changes that are no longer the ones shown as a conflict", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const { workflow: imported } = await caller.workflows.import({ path: sourcePath })
    writeFileSync(sourcePath, fixtureText("h3-r2v-base").replace('"Seed"', '"Noise seed"'))

    await expect(
      caller.workflows.applyUpdate({ workflowId: imported.id, contentHash: "0".repeat(64) })
    ).rejects.toThrow(expect.objectContaining({ code: "CONFLICT" }))
  })
})
