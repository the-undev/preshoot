import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema, type ProjectDatabaseHandle } from "../db"
import { fixtureText } from "../workflows/fixtures"
import { importWorkflow } from "../workflows/store"
import {
  completeRun,
  deleteRun,
  listRuns,
  markFailed,
  markUnfinished,
  readRun,
  readRunOutput,
  readRunPrompt,
  recordRun,
  type RecordedBinding,
} from "./run-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

const binding: RecordedBinding = {
  slotId: 4,
  slotName: "Seed",
  on: true,
  value: 42,
  file: null,
}

describe("run store", () => {
  let dir: string
  let handle: ProjectDatabaseHandle
  let workflowId: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-runs-"))
    const folder = join(dir, "workflows")
    mkdirSync(folder)
    const sourcePath = join(folder, "h3-r2v-base.json")
    writeFileSync(sourcePath, fixtureText("h3-r2v-base"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
    workflowId = importWorkflow(handle.db, { folder, sourcePath }).id
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function record(promptId: string, createdAt: Date): ReturnType<typeof recordRun> {
    return recordRun(handle.db, {
      workflowId,
      configurationId: null,
      promptId,
      apiPrompt: '{"1":{"class_type":"KSamplerSelect","inputs":{}}}',
      bindings: [binding],
      seed: 42,
      createdAt,
    })
  }

  it("records a run as queued with what made it", () => {
    const run = record("a1b2", new Date("2026-03-04T05:06:07Z"))

    expect(readRun(handle.db, run.id)).toEqual({
      id: run.id,
      workflowId,
      configurationId: null,
      configurationName: null,
      promptId: "a1b2",
      state: "queued",
      seed: 42,
      error: null,
      bindings: [binding],
      createdAt: "2026-03-04T05:06:07.000Z",
      finishedAt: null,
      outputs: [],
    })
    expect(readRunPrompt(handle.db, run.id)).toBe(
      '{"1":{"class_type":"KSamplerSelect","inputs":{}}}'
    )
  })

  it("lists a workflow's runs newest first", () => {
    record("first", new Date("2026-03-04T05:00:00Z"))
    record("second", new Date("2026-03-04T06:00:00Z"))

    expect(listRuns(handle.db, workflowId).map((run) => run.promptId)).toEqual(["second", "first"])
  })

  it("names the configuration a run was queued from", () => {
    const at = new Date("2026-03-04T05:00:00Z")
    const configuration = handle.db
      .insert(schema.configurations)
      .values({ workflowId, name: "Anna", bindings: [], createdAt: at, updatedAt: at })
      .returning()
      .get()
    const run = recordRun(handle.db, {
      workflowId,
      configurationId: configuration.id,
      promptId: "a1b2",
      apiPrompt: "{}",
      bindings: [binding],
      seed: 42,
      createdAt: at,
    })

    expect(run).toMatchObject({ configurationId: configuration.id, configurationName: "Anna" })
    expect(listRuns(handle.db, workflowId)[0].configurationName).toBe("Anna")
  })

  it("moves an unfinished run between queued and running", () => {
    const run = record("a1b2", new Date())

    expect(markUnfinished(handle.db, run.id, "running").state).toBe("running")
    expect(markUnfinished(handle.db, run.id, "queued").state).toBe("queued")
  })

  it("marks a run failed with why and when", () => {
    const run = record("a1b2", new Date())

    const failed = markFailed(handle.db, run.id, "Out of memory", new Date("2026-03-04T07:00:00Z"))

    expect(failed).toMatchObject({
      state: "failed",
      error: "Out of memory",
      finishedAt: "2026-03-04T07:00:00.000Z",
    })
  })

  it("records a finished run's outputs with it, once", () => {
    const run = record("a1b2", new Date())
    const outputs = [
      { path: "outputs/run-1/clip.mp4", sourceFilename: "clip_00001_.mp4" },
      { path: "outputs/run-1/clip-2.mp4", sourceFilename: "clip_00001_.mp4" },
    ]

    completeRun(handle.db, run.id, outputs, new Date("2026-03-04T08:00:00Z"))
    const again = completeRun(handle.db, run.id, outputs, new Date("2026-03-04T09:00:00Z"))

    expect(again.state).toBe("done")
    expect(again.finishedAt).toBe("2026-03-04T08:00:00.000Z")
    expect(again.outputs.map((output) => output.path)).toEqual([
      "outputs/run-1/clip.mp4",
      "outputs/run-1/clip-2.mp4",
    ])
    expect(listRuns(handle.db, workflowId)[0].outputs).toEqual(again.outputs)
    expect(readRunOutput(handle.db, again.outputs[0].id).sourceFilename).toBe("clip_00001_.mp4")
  })

  it("leaves a finished run as it is", () => {
    const run = record("a1b2", new Date())
    completeRun(handle.db, run.id, [], new Date())

    expect(markFailed(handle.db, run.id, "late", new Date()).state).toBe("done")
    expect(markUnfinished(handle.db, run.id, "running").state).toBe("done")
  })

  /** Records a run and finishes it with one file written to its folder. */
  function finished(promptId: string, bindings: RecordedBinding[] = [binding]): number {
    const run = recordRun(handle.db, {
      workflowId,
      configurationId: null,
      promptId,
      apiPrompt: "{}",
      bindings,
      seed: 42,
      createdAt: new Date(),
    })
    const path = `outputs/run-${run.id}/clip.mp4`
    mkdirSync(join(dir, `outputs/run-${run.id}`), { recursive: true })
    writeFileSync(join(dir, path), "video")
    completeRun(handle.db, run.id, [{ path, sourceFilename: "clip.mp4" }], new Date())
    return run.id
  }

  it("deletes a finished run with its outputs and their folder, and nothing of another run", () => {
    const deleted = finished("first")
    const kept = finished("second")

    deleteRun({ db: handle.db, directory: dir, runId: deleted })

    expect(() => readRun(handle.db, deleted)).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
    expect(
      handle.db.select().from(schema.runOutputs).where(eq(schema.runOutputs.runId, deleted)).all()
    ).toEqual([])
    expect(existsSync(join(dir, `outputs/run-${deleted}`))).toBe(false)
    expect(listRuns(handle.db, workflowId).map((run) => run.id)).toEqual([kept])
    expect(existsSync(join(dir, `outputs/run-${kept}/clip.mp4`))).toBe(true)
  })

  it("refuses to delete a run still queued or running", () => {
    const queued = record("a1b2", new Date())
    const running = markUnfinished(handle.db, record("c3d4", new Date()).id, "running")

    for (const runId of [queued.id, running.id]) {
      expect(() => deleteRun({ db: handle.db, directory: dir, runId })).toThrow(
        expect.objectContaining({ code: "unfinished" })
      )
    }
    expect(listRuns(handle.db, workflowId)).toHaveLength(2)
  })

  it("removes the input files only the deleted run named, and never one outside the inputs folder", () => {
    mkdirSync(join(dir, "inputs"))
    mkdirSync(join(dir, "pictures"))
    for (const path of ["inputs/anna.png", "inputs/shared.png", "pictures/own.png"]) {
      writeFileSync(join(dir, path), "picture")
    }
    const at = new Date()
    handle.db
      .insert(schema.configurations)
      .values({
        workflowId,
        name: "Anna",
        bindings: [
          {
            nodeId: 1,
            nodeType: "LoadImage",
            slotName: "Picture",
            on: true,
            value: { type: "file", path: "inputs/shared.png" },
          },
        ],
        createdAt: at,
        updatedAt: at,
      })
      .run()
    const picture = (slotId: number, path: string): RecordedBinding => ({
      slotId,
      slotName: "Picture",
      on: true,
      value: "preshoot/picture.png",
      file: join(dir, path),
    })
    const runId = finished("a1b2", [
      picture(1, "inputs/anna.png"),
      picture(2, "inputs/shared.png"),
      picture(3, "pictures/own.png"),
    ])

    deleteRun({ db: handle.db, directory: dir, runId })

    expect(existsSync(join(dir, "inputs/anna.png"))).toBe(false)
    expect(existsSync(join(dir, "inputs/shared.png"))).toBe(true)
    expect(existsSync(join(dir, "pictures/own.png"))).toBe(true)
  })

  it("reads a run's files named by project path as it reads those named in full", () => {
    mkdirSync(join(dir, "inputs"))
    for (const path of ["inputs/anna.png", "inputs/kept.png"]) writeFileSync(join(dir, path), "")
    const picture = (slotId: number, file: string): RecordedBinding => ({
      slotId,
      slotName: "Picture",
      on: true,
      value: "preshoot/picture.png",
      file,
    })
    finished("other", [picture(1, "inputs/kept.png")])
    const runId = finished("a1b2", [picture(1, "inputs/anna.png"), picture(2, "inputs/kept.png")])

    deleteRun({ db: handle.db, directory: dir, runId })

    expect(existsSync(join(dir, "inputs/anna.png"))).toBe(false)
    expect(existsSync(join(dir, "inputs/kept.png"))).toBe(true)
  })

  it("reports a run that is not there as not found", () => {
    expect(() => readRun(handle.db, 99)).toThrow(expect.objectContaining({ code: "not-found" }))
  })
})
