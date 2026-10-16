import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ClipHistory } from "../../core/composition/history"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import { readGraph } from "../../core/workflows/scan"
import { fixtureText } from "../../core/workflows/fixtures"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("configurations router", () => {
  let dir: string
  let folder: string
  let picture: string
  let session: ProjectSession
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-configurations-router-"))
    folder = join(dir, "workflows")
    mkdirSync(folder)
    writeFileSync(join(folder, "h3-r2v-base.json"), fixtureText("h3-r2v-base"))
    picture = join(dir, "anna.png")
    writeFileSync(picture, Buffer.from([1, 2, 3]))
    session = new ProjectSession()
    const settings = new AppSettingsStore(join(dir, "settings.json"))
    settings.setWorkflowsFolder(folder)
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
        throw new Error("the configurations router does not generate prompts")
      },
      comfyUiClient: () => {
        throw new Error("the configurations router does not reach ComfyUI")
      },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function openProjectWithWorkflow(): Promise<
    Awaited<ReturnType<typeof caller.workflows.import>>
  > {
    await caller.projects.create({
      directory: join(dir, "film"),
      name: "Film",
      createDirectory: false,
      allowNonEmpty: false,
    })
    return caller.workflows.import({ path: join(folder, "h3-r2v-base.json") })
  }

  function slotIdOf(
    workflow: Awaited<ReturnType<typeof openProjectWithWorkflow>>,
    name: string
  ): number {
    const slot = workflow.slots.find((entry) => entry.name === name)
    if (!slot) throw new Error(`no slot ${name}`)
    return slot.id
  }

  async function saved(): Promise<{
    workflow: Awaited<ReturnType<typeof openProjectWithWorkflow>>
    configuration: Awaited<ReturnType<typeof caller.configurations.save>>
  }> {
    const workflow = await openProjectWithWorkflow()
    const configuration = await caller.configurations.save({
      workflowId: workflow.id,
      name: "  Anna  ",
      bindings: [
        {
          slotId: slotIdOf(workflow, "Prompt"),
          on: true,
          value: { type: "value", value: "She turns." },
        },
        {
          slotId: slotIdOf(workflow, "Turbo steps"),
          on: true,
          value: { type: "value", value: 4 },
        },
        {
          slotId: slotIdOf(workflow, "Picture 1"),
          on: true,
          value: { type: "file", path: picture },
        },
      ],
    })
    return { workflow, configuration }
  }

  it("asks for a project before listing configurations", async () => {
    await expect(caller.configurations.list({ workflowId: 1 })).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("saves a configuration under its trimmed name with its file copied into the project", async () => {
    const { workflow, configuration } = await saved()

    expect(configuration).toMatchObject({ name: "Anna", staleSlotNames: [] })
    expect(readFileSync(join(dir, "film", "inputs", "anna.png"))).toEqual(Buffer.from([1, 2, 3]))
    expect(
      (await caller.configurations.list({ workflowId: workflow.id })).map((entry) => entry.name)
    ).toEqual(["Anna"])
  })

  it("refuses a blank name", async () => {
    const workflow = await openProjectWithWorkflow()

    await expect(
      caller.configurations.save({ workflowId: workflow.id, name: "   ", bindings: [] })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("refuses a file that cannot be copied in as a bad request", async () => {
    const workflow = await openProjectWithWorkflow()

    await expect(
      caller.configurations.save({
        workflowId: workflow.id,
        name: "Broken",
        bindings: [
          {
            slotId: slotIdOf(workflow, "Picture 1"),
            on: true,
            value: { type: "file", path: join(dir, "missing.png") },
          },
        ],
      })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("loads a configuration with its copied file", async () => {
    const { workflow, configuration } = await saved()

    const loaded = await caller.configurations.load({ configurationId: configuration.id })

    expect(loaded.bindings).toContainEqual({
      slotId: slotIdOf(workflow, "Picture 1"),
      on: true,
      value: { type: "file", path: join(dir, "film", "inputs", "anna.png") },
    })
  })

  it("names the slots a source update took away", async () => {
    const { workflow, configuration } = await saved()
    const sourcePath = join(folder, "h3-r2v-base.json")
    const graph = readGraph(sourcePath, readFileSync(sourcePath, "utf8"))
    graph.nodes = graph.nodes.filter((node) => node.id !== 21)
    writeFileSync(sourcePath, JSON.stringify(graph))
    const status = await caller.workflows.checkSource({ workflowId: workflow.id })
    if (status.state !== "changed") throw new Error("the source did not change")
    await caller.workflows.applyUpdate({
      workflowId: workflow.id,
      contentHash: status.contentHash,
    })

    const loaded = await caller.configurations.load({ configurationId: configuration.id })

    expect(loaded.configuration.staleSlotNames).toEqual(["Turbo steps"])
    expect(loaded.bindings).toHaveLength(2)
    expect(
      (await caller.configurations.list({ workflowId: workflow.id }))[0].staleSlotNames
    ).toEqual(["Turbo steps"])
  })

  it("names the configurations that bind a slot the source would remove", async () => {
    const { workflow } = await saved()
    await caller.configurations.save({
      workflowId: workflow.id,
      name: "Prompt only",
      bindings: [
        { slotId: slotIdOf(workflow, "Prompt"), on: true, value: { type: "value", value: "Hi." } },
      ],
    })
    const sourcePath = join(folder, "h3-r2v-base.json")
    const graph = readGraph(sourcePath, readFileSync(sourcePath, "utf8"))
    graph.nodes = graph.nodes.filter((node) => node.id !== 21)
    writeFileSync(sourcePath, JSON.stringify(graph))

    const status = await caller.workflows.checkSource({ workflowId: workflow.id })

    if (status.state !== "changed") throw new Error("the source did not change")
    expect(status.diff.removed.map((slot) => slot.name)).toEqual(["Turbo steps"])
    expect(status.boundConfigurationNames).toEqual(["Anna"])
  })

  it("names no configuration when the slot a source would remove is bound by none", async () => {
    const workflow = await openProjectWithWorkflow()
    await caller.configurations.save({
      workflowId: workflow.id,
      name: "Prompt only",
      bindings: [
        { slotId: slotIdOf(workflow, "Prompt"), on: true, value: { type: "value", value: "Hi." } },
      ],
    })
    const sourcePath = join(folder, "h3-r2v-base.json")
    const graph = readGraph(sourcePath, readFileSync(sourcePath, "utf8"))
    graph.nodes = graph.nodes.filter((node) => node.id !== 21)
    writeFileSync(sourcePath, JSON.stringify(graph))

    const status = await caller.workflows.checkSource({ workflowId: workflow.id })

    if (status.state !== "changed") throw new Error("the source did not change")
    expect(status.boundConfigurationNames).toEqual([])
  })

  it("updates a configuration's values", async () => {
    const { workflow, configuration } = await saved()
    const prompt = slotIdOf(workflow, "Prompt")

    await caller.configurations.update({
      configurationId: configuration.id,
      bindings: [{ slotId: prompt, on: true, value: { type: "value", value: "He sits." } }],
    })

    const loaded = await caller.configurations.load({ configurationId: configuration.id })
    expect(loaded.bindings).toEqual([
      { slotId: prompt, on: true, value: { type: "value", value: "He sits." } },
    ])
    expect(existsSync(join(dir, "film", "inputs", "anna.png"))).toBe(false)
  })

  it("renames, duplicates and deletes a configuration", async () => {
    const { workflow, configuration } = await saved()

    await caller.configurations.rename({ configurationId: configuration.id, name: "Bea" })
    const copy = await caller.configurations.duplicate({ configurationId: configuration.id })
    expect(copy.name).toBe("Bea copy")
    expect(existsSync(join(dir, "film", "inputs", "anna-2.png"))).toBe(true)

    await caller.configurations.delete({ configurationId: configuration.id })

    expect(
      (await caller.configurations.list({ workflowId: workflow.id })).map((entry) => entry.name)
    ).toEqual(["Bea copy"])
    expect(existsSync(join(dir, "film", "inputs", "anna.png"))).toBe(false)
    expect(existsSync(join(dir, "film", "inputs", "anna-2.png"))).toBe(true)
  })

  it("reports a configuration that is not there as not found", async () => {
    await openProjectWithWorkflow()

    await expect(caller.configurations.load({ configurationId: 999 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
    await expect(
      caller.configurations.rename({ configurationId: 999, name: "Nobody" })
    ).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }))
    await expect(caller.configurations.duplicate({ configurationId: 999 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
    await expect(caller.configurations.delete({ configurationId: 999 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })
})
