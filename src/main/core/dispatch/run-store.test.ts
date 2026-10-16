import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import { fixtureText } from "../workflows/fixtures"
import { importWorkflow } from "../workflows/store"
import {
  completeRun,
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

  it("reports a run that is not there as not found", () => {
    expect(() => readRun(handle.db, 99)).toThrow(expect.objectContaining({ code: "not-found" }))
  })
})
