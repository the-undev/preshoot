import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ClipHistory } from "../../core/composition/history"
import { completeRun, recordRun, type RunRecord } from "../../core/dispatch/run-store"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import { fixtureText } from "../../core/workflows/fixtures"
import type { Context, Dialogs } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("review router", () => {
  let dir: string
  let folder: string
  let session: ProjectSession
  let pickDirectory: Dialogs["pickDirectory"]
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-review-router-"))
    folder = join(dir, "workflows")
    mkdirSync(folder)
    writeFileSync(join(folder, "h3-r2v-base.json"), fixtureText("h3-r2v-base"))
    session = new ProjectSession()
    const settings = new AppSettingsStore(join(dir, "settings.json"))
    settings.setWorkflowsFolder(folder)
    pickDirectory = vi.fn(async () => join(dir, "picked"))
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      history: new ClipHistory(),
      settings,
      migrationsFolder,
      dialogs: {
        pickDirectory: (options) => pickDirectory(options),
        pickFiles: async () => [],
        saveFile: async () => null,
      },
      openPath: async () => {},
      promptClient: () => {
        throw new Error("the review router does not generate prompts")
      },
      comfyUiClient: () => {
        throw new Error("the review router does not talk to ComfyUI")
      },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function openProjectWithWorkflow(): Promise<number> {
    await caller.projects.create({
      directory: join(dir, "film"),
      name: "Film",
      createDirectory: false,
      allowNonEmpty: false,
    })
    return (await caller.workflows.import({ path: join(folder, "h3-r2v-base.json") })).workflow.id
  }

  /** A finished run of the workflow with one file per name, written into the project. */
  function finishedRun(workflowId: number, seed: number, files: string[]): RunRecord {
    const project = session.current()
    if (!project) throw new Error("no project open")
    const run = recordRun(project.db, {
      workflowId,
      configurationId: null,
      promptId: `prompt-${seed}`,
      apiPrompt: "{}",
      bindings: [],
      seed,
      createdAt: new Date("2026-03-04T05:00:00Z"),
    })
    const outputs = `outputs/run-${run.id}`
    mkdirSync(join(project.directory, outputs), { recursive: true })
    for (const file of files) writeFileSync(join(project.directory, outputs, file), file)
    return completeRun(
      project.db,
      run.id,
      files.map((file) => ({ path: `${outputs}/${file}`, sourceFilename: file })),
      new Date("2026-03-04T05:01:00Z")
    )
  }

  it("asks for a project before anything", async () => {
    await expect(caller.review.counts({ workflowId: 1 })).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
    await expect(caller.review.setVerdict({ outputId: 1, verdict: "good" })).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
    await expect(caller.review.exportGood({ workflowId: 1 })).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("marks an output, clears it, and counts the workflow's verdicts", async () => {
    const workflowId = await openProjectWithWorkflow()
    const [first, second] = finishedRun(workflowId, 7, ["a.png", "b.png"]).outputs

    expect((await caller.review.setVerdict({ outputId: first.id, verdict: "good" })).verdict).toBe(
      "good"
    )
    await caller.review.setVerdict({ outputId: second.id, verdict: "bad" })
    expect(await caller.review.counts({ workflowId })).toEqual({
      all: 2,
      good: 1,
      bad: 1,
      unmarked: 0,
    })

    await caller.review.setVerdict({ outputId: second.id, verdict: null })
    expect(await caller.review.counts({ workflowId })).toEqual({
      all: 2,
      good: 1,
      bad: 0,
      unmarked: 1,
    })
    const [run] = await caller.runs.list({ workflowId })
    expect(run.outputs.map((output) => output.verdict)).toEqual(["good", null])
  })

  it("saves a note, which the run list then carries", async () => {
    const workflowId = await openProjectWithWorkflow()
    const [output] = finishedRun(workflowId, 7, ["a.png"]).outputs

    expect((await caller.review.setNote({ outputId: output.id, note: "Too dark." })).note).toBe(
      "Too dark."
    )
    const [run] = await caller.runs.list({ workflowId })
    expect(run.outputs[0].note).toBe("Too dark.")
  })

  it("refuses an output that is not there as not found", async () => {
    await openProjectWithWorkflow()

    await expect(caller.review.setVerdict({ outputId: 99, verdict: "bad" })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
    await expect(caller.review.setNote({ outputId: 99, note: "x" })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })

  it("refuses a verdict it does not know and a note past the limit", async () => {
    const workflowId = await openProjectWithWorkflow()
    const [output] = finishedRun(workflowId, 7, ["a.png"]).outputs

    await expect(
      caller.review.setVerdict({ outputId: output.id, verdict: "maybe" as "good" })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
    await expect(
      caller.review.setNote({ outputId: output.id, note: "x".repeat(2001) })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("copies the good outputs into the folder picked", async () => {
    const workflowId = await openProjectWithWorkflow()
    const [good, bad] = finishedRun(workflowId, 7, ["a.png", "b.png"]).outputs
    await caller.review.setVerdict({ outputId: good.id, verdict: "good" })
    await caller.review.setVerdict({ outputId: bad.id, verdict: "bad" })

    const result = await caller.review.exportGood({ workflowId })

    expect(result).toEqual({
      state: "written",
      folder: join(dir, "picked"),
      paths: [join(dir, "picked", "h3-r2v-base-adhoc-s7-a.png")],
    })
    expect(pickDirectory).toHaveBeenCalledWith(expect.objectContaining({ allowCreate: true }))
    expect(readdirSync(join(dir, "picked"))).toEqual(["h3-r2v-base-adhoc-s7-a.png"])
  })

  it("asks for no folder when nothing is marked good", async () => {
    const workflowId = await openProjectWithWorkflow()
    finishedRun(workflowId, 7, ["a.png"])

    expect(await caller.review.exportGood({ workflowId })).toEqual({ state: "nothing" })
    expect(pickDirectory).not.toHaveBeenCalled()
  })

  it("writes nothing when the folder pick is cancelled", async () => {
    const workflowId = await openProjectWithWorkflow()
    const [output] = finishedRun(workflowId, 7, ["a.png"]).outputs
    await caller.review.setVerdict({ outputId: output.id, verdict: "good" })
    pickDirectory = vi.fn(async () => null)

    expect(await caller.review.exportGood({ workflowId })).toEqual({ state: "cancelled" })
    expect(existsSync(join(dir, "picked"))).toBe(false)
  })

  it("refuses an export whose good output has gone from the project", async () => {
    const workflowId = await openProjectWithWorkflow()
    const [output] = finishedRun(workflowId, 7, ["a.png"]).outputs
    await caller.review.setVerdict({ outputId: output.id, verdict: "good" })
    rmSync(join(dir, "film", output.path))

    await expect(caller.review.exportGood({ workflowId })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
  })
})
