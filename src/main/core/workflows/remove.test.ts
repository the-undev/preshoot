import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { saveConfiguration } from "../configurations/store"
import { openProjectDatabase, schema, type ProjectDatabaseHandle } from "../db"
import { completeRun, markUnfinished, recordRun } from "../dispatch/run-store"
import { fixtureText } from "./fixtures"
import { listWorkflowFolder } from "./folder"
import { removeWorkflow } from "./remove"
import { importWorkflow, listWorkflows, type WorkflowDetail } from "./store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")
const now = new Date(2026, 9, 16, 10, 0, 0)

describe("removing a workflow", () => {
  let dir: string
  let folder: string
  let project: string
  let picture: string
  let handle: ProjectDatabaseHandle
  let removed: WorkflowDetail
  let other: WorkflowDetail

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-remove-workflow-"))
    folder = join(dir, "workflows")
    project = join(dir, "film")
    mkdirSync(folder)
    mkdirSync(project)
    writeFileSync(join(folder, "h3-r2v-base.json"), fixtureText("h3-r2v-base"))
    writeFileSync(join(folder, "h3-fl2v-base.json"), fixtureText("h3-fl2v-base"))
    picture = join(dir, "anna.png")
    writeFileSync(picture, Buffer.from([1, 2, 3]))
    handle = openProjectDatabase(join(project, "project.db"), migrationsFolder)
    removed = importWorkflow(handle.db, { folder, sourcePath: join(folder, "h3-r2v-base.json") })
    other = importWorkflow(handle.db, { folder, sourcePath: join(folder, "h3-fl2v-base.json") })
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function imageSlotId(workflow: WorkflowDetail): number {
    const slot = workflow.slots.find((entry) => entry.kind === "image")
    if (!slot) throw new Error(`${workflow.name} has no image slot`)
    return slot.id
  }

  /**
   * Saves a configuration binding `file` to the workflow's image slot, and a finished run queued
   * from it with one output on disk. Gives the configuration's input file and the run's folder.
   */
  function fill(workflow: WorkflowDetail, file: string): { input: string; runFolder: string } {
    const slotId = imageSlotId(workflow)
    const configuration = saveConfiguration({
      db: handle.db,
      directory: project,
      workflowId: workflow.id,
      name: "Anna",
      bindings: [{ slotId, on: true, value: { type: "file", path: file } }],
      now,
    })
    const input = handle.db
      .select()
      .from(schema.configurations)
      .where(eq(schema.configurations.id, configuration.id))
      .get()?.bindings as { value: { path: string } }[]
    const inputPath = input[0].value.path
    const run = recordRun(handle.db, {
      workflowId: workflow.id,
      configurationId: configuration.id,
      promptId: `prompt-${workflow.id}`,
      apiPrompt: "{}",
      bindings: [
        {
          slotId,
          slotName: "Picture",
          on: true,
          value: "preshoot/anna.png",
          file: join(project, inputPath),
        },
      ],
      seed: 42,
      createdAt: now,
    })
    const runFolder = `outputs/run-${run.id}`
    mkdirSync(join(project, runFolder), { recursive: true })
    writeFileSync(join(project, runFolder, "clip.mp4"), "video")
    completeRun(
      handle.db,
      run.id,
      [{ path: `${runFolder}/clip.mp4`, sourceFilename: "clip.mp4" }],
      now
    )
    return { input: inputPath, runFolder }
  }

  function rowsOf(workflowId: number): Record<string, number> {
    const runIds = handle.db
      .select({ id: schema.runs.id })
      .from(schema.runs)
      .where(eq(schema.runs.workflowId, workflowId))
      .all()
      .map((row) => row.id)
    const outputs = handle.db
      .select()
      .from(schema.runOutputs)
      .all()
      .filter((row) => runIds.includes(row.runId))
    return {
      workflows: handle.db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, workflowId))
        .all().length,
      slots: handle.db
        .select()
        .from(schema.workflowSlots)
        .where(eq(schema.workflowSlots.workflowId, workflowId))
        .all().length,
      configurations: handle.db
        .select()
        .from(schema.configurations)
        .where(eq(schema.configurations.workflowId, workflowId))
        .all().length,
      runs: runIds.length,
      outputs: outputs.length,
    }
  }

  it("takes its slots, configurations, runs and their files, and nothing of another workflow", () => {
    const gone = fill(removed, picture)
    const kept = fill(other, picture)
    const otherRowsBefore = rowsOf(other.id)

    removeWorkflow({ db: handle.db, directory: project, workflowId: removed.id })

    expect(rowsOf(removed.id)).toEqual({
      workflows: 0,
      slots: 0,
      configurations: 0,
      runs: 0,
      outputs: 0,
    })
    expect(existsSync(join(project, gone.runFolder))).toBe(false)
    expect(existsSync(join(project, gone.input))).toBe(false)
    expect(rowsOf(other.id)).toEqual(otherRowsBefore)
    expect(existsSync(join(project, kept.runFolder, "clip.mp4"))).toBe(true)
    expect(existsSync(join(project, kept.input))).toBe(true)
  })

  it("leaves the source file as it was, so the folder lists it as importable again", () => {
    fill(removed, picture)

    removeWorkflow({ db: handle.db, directory: project, workflowId: removed.id })

    expect(readFileSync(join(folder, "h3-r2v-base.json"), "utf8")).toBe(fixtureText("h3-r2v-base"))
    expect(existsSync(picture)).toBe(true)
    const listing = listWorkflowFolder(folder, listWorkflows(handle.db))
    if (listing.state !== "listed") throw new Error("the folder was not listed")
    expect(
      listing.files.map((file) => [file.relativePath, file.importedWorkflowId !== null])
    ).toEqual([
      ["h3-fl2v-base.json", true],
      ["h3-r2v-base.json", false],
    ])
  })

  it("keeps an input file another workflow's configuration still names", () => {
    const gone = fill(removed, picture)
    // A file already in the inputs folder is named where it is rather than copied again.
    fill(other, join(project, gone.input))

    removeWorkflow({ db: handle.db, directory: project, workflowId: removed.id })

    expect(existsSync(join(project, gone.input))).toBe(true)
  })

  it("removes a workflow that has no configurations or runs", () => {
    removeWorkflow({ db: handle.db, directory: project, workflowId: removed.id })

    expect(listWorkflows(handle.db).map((workflow) => workflow.id)).toEqual([other.id])
  })

  it("refuses while a run is still queued or running, and keeps everything", () => {
    fill(removed, picture)
    const run = recordRun(handle.db, {
      workflowId: removed.id,
      configurationId: null,
      promptId: "waiting",
      apiPrompt: "{}",
      bindings: [],
      seed: null,
      createdAt: now,
    })
    markUnfinished(handle.db, run.id, "running")
    const before = rowsOf(removed.id)

    expect(() =>
      removeWorkflow({ db: handle.db, directory: project, workflowId: removed.id })
    ).toThrow(expect.objectContaining({ code: "runs-unfinished" }))
    expect(rowsOf(removed.id)).toEqual(before)
  })

  it("reports a workflow that is not there as not found", () => {
    expect(() => removeWorkflow({ db: handle.db, directory: project, workflowId: 99 })).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
  })
})
