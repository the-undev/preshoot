import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ClipHistory } from "../../core/composition/history"
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

    const imported = await caller.workflows.import({ path: sourcePath })
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
    const imported = await caller.workflows.import({ path: sourcePath })
    const seed = imported.slots.find((slot) => slot.name === "Seed")
    if (!seed) throw new Error("no seed slot")

    await caller.workflows.setTier({ slotId: seed.id, tier: "hidden" })
    const workflow = await caller.workflows.get({ workflowId: imported.id })

    expect(workflow.slots.find((slot) => slot.id === seed.id)?.tier).toBe("hidden")
    expect(workflow.guide.map((note) => note.title)).toEqual(["How to use"])
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
    const imported = await caller.workflows.import({ path: sourcePath })
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

  it("refuses changes that are no longer the ones shown as a conflict", async () => {
    await openProject()
    settings.setWorkflowsFolder(folder)
    const imported = await caller.workflows.import({ path: sourcePath })
    writeFileSync(sourcePath, fixtureText("h3-r2v-base").replace('"Seed"', '"Noise seed"'))

    await expect(
      caller.workflows.applyUpdate({ workflowId: imported.id, contentHash: "0".repeat(64) })
    ).rejects.toThrow(expect.objectContaining({ code: "CONFLICT" }))
  })
})
