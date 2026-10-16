import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema, type ProjectDatabaseHandle } from "../db"
import { fixtureText } from "../workflows/fixtures"
import { importWorkflow } from "../workflows/store"
import {
  countVerdicts,
  exportGoodOutputs,
  listReviewedOutputs,
  setOutputNote,
  setOutputVerdict,
} from "./review"
import { completeRun, readRunOutput, recordRun, type RunRecord } from "./run-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("output review", () => {
  let dir: string
  let project: string
  let handle: ProjectDatabaseHandle
  let workflowId: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-review-"))
    project = join(dir, "film")
    const folder = join(dir, "workflows")
    mkdirSync(folder)
    mkdirSync(project)
    const sourcePath = join(folder, "h3-r2v-base.json")
    writeFileSync(sourcePath, fixtureText("h3-r2v-base"))
    handle = openProjectDatabase(join(project, "project.db"), migrationsFolder)
    workflowId = importWorkflow(handle.db, { folder, sourcePath }).id
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  /** A finished run with the files named, each written into the project's outputs folder. */
  function finishedRun(input: {
    createdAt: string
    seed: number | null
    files: string[]
    configurationId?: number
  }): RunRecord {
    const run = recordRun(handle.db, {
      workflowId,
      configurationId: input.configurationId ?? null,
      promptId: `prompt-${input.createdAt}`,
      apiPrompt: "{}",
      bindings: [],
      seed: input.seed,
      createdAt: new Date(input.createdAt),
    })
    const folder = `outputs/run-${run.id}`
    mkdirSync(join(project, folder), { recursive: true })
    for (const file of input.files) {
      writeFileSync(join(project, folder, file), `${file} of run ${run.id}`)
    }
    return completeRun(
      handle.db,
      run.id,
      input.files.map((file) => ({ path: `${folder}/${file}`, sourceFilename: file })),
      new Date(input.createdAt)
    )
  }

  function configuration(name: string): number {
    const at = new Date("2026-03-04T05:00:00Z")
    return handle.db
      .insert(schema.configurations)
      .values({ workflowId, name, bindings: [], createdAt: at, updatedAt: at })
      .returning()
      .get().id
  }

  it("starts an output unmarked with no note, and says what it holds", () => {
    const run = finishedRun({
      createdAt: "2026-03-04T05:00:00Z",
      seed: 7,
      files: ["frame.png", "clip.mp4", "voice.wav", "log.json"],
    })

    expect(run.outputs.map((output) => [output.media, output.verdict, output.note])).toEqual([
      ["image", null, ""],
      ["video", null, ""],
      ["audio", null, ""],
      ["other", null, ""],
    ])
  })

  it("marks an output good or bad and clears the verdict", () => {
    const [output] = finishedRun({
      createdAt: "2026-03-04T05:00:00Z",
      seed: 7,
      files: ["clip.mp4"],
    }).outputs

    expect(setOutputVerdict(handle.db, output.id, "good").verdict).toBe("good")
    expect(setOutputVerdict(handle.db, output.id, "bad").verdict).toBe("bad")
    expect(readRunOutput(handle.db, output.id).verdict).toBe("bad")
    expect(setOutputVerdict(handle.db, output.id, null).verdict).toBeNull()
    expect(readRunOutput(handle.db, output.id).verdict).toBeNull()
  })

  it("saves a note and keeps it when the verdict changes", () => {
    const [output] = finishedRun({
      createdAt: "2026-03-04T05:00:00Z",
      seed: 7,
      files: ["clip.mp4"],
    }).outputs

    expect(setOutputNote(handle.db, output.id, "Hands melt at 3s.").note).toBe("Hands melt at 3s.")
    setOutputVerdict(handle.db, output.id, "bad")

    expect(readRunOutput(handle.db, output.id)).toMatchObject({
      verdict: "bad",
      note: "Hands melt at 3s.",
    })
  })

  it("refuses an output that is not there", () => {
    expect(() => setOutputVerdict(handle.db, 99, "good")).toThrow("Output 99")
    expect(() => setOutputNote(handle.db, 99, "note")).toThrow("Output 99")
  })

  it("lists a workflow's outputs by verdict, newest run first, and counts them", () => {
    const older = finishedRun({
      createdAt: "2026-03-04T05:00:00Z",
      seed: 1,
      files: ["a.png", "b.png"],
    })
    const newer = finishedRun({
      createdAt: "2026-03-04T06:00:00Z",
      seed: 2,
      files: ["c.png", "d.png"],
    })
    setOutputVerdict(handle.db, older.outputs[0].id, "good")
    setOutputVerdict(handle.db, newer.outputs[1].id, "good")
    setOutputVerdict(handle.db, older.outputs[1].id, "bad")

    const names = (filter: Parameters<typeof listReviewedOutputs>[2]): string[] =>
      listReviewedOutputs(handle.db, workflowId, filter).map((output) => output.sourceFilename)
    expect(names("all")).toEqual(["c.png", "d.png", "a.png", "b.png"])
    expect(names("good")).toEqual(["d.png", "a.png"])
    expect(names("bad")).toEqual(["b.png"])
    expect(names("unmarked")).toEqual(["c.png"])
    expect(countVerdicts(handle.db, workflowId)).toEqual({ all: 4, good: 2, bad: 1, unmarked: 1 })
  })

  it("counts nothing for a workflow with no outputs", () => {
    expect(countVerdicts(handle.db, workflowId)).toEqual({ all: 0, good: 0, bad: 0, unmarked: 0 })
    expect(listReviewedOutputs(handle.db, workflowId, "all")).toEqual([])
  })

  it("copies the good outputs out, named for the workflow, configuration and seed", () => {
    const anna = configuration("Anna at dusk")
    const adhoc = finishedRun({
      createdAt: "2026-03-04T05:00:00Z",
      seed: 11,
      files: ["clip_00001_.mp4", "skip.png"],
    })
    const configured = finishedRun({
      createdAt: "2026-03-04T06:00:00Z",
      seed: 22,
      files: ["frame_00001_.png"],
      configurationId: anna,
    })
    setOutputVerdict(handle.db, adhoc.outputs[0].id, "good")
    setOutputVerdict(handle.db, adhoc.outputs[1].id, "bad")
    setOutputVerdict(handle.db, configured.outputs[0].id, "good")
    const destination = join(dir, "picked")

    const result = exportGoodOutputs({
      db: handle.db,
      projectDirectory: project,
      workflowId,
      destination,
    })

    expect(result).toEqual({
      state: "written",
      paths: [
        join(destination, "h3-r2v-base-Anna-at-dusk-s22-frame_00001_.png"),
        join(destination, "h3-r2v-base-adhoc-s11-clip_00001_.mp4"),
      ],
    })
    expect(readFileSync(join(destination, "h3-r2v-base-adhoc-s11-clip_00001_.mp4"), "utf8")).toBe(
      `clip_00001_.mp4 of run ${adhoc.id}`
    )
    // Copied, so the project still holds its own.
    expect(existsSync(join(project, adhoc.outputs[0].path))).toBe(true)
    expect(existsSync(join(project, configured.outputs[0].path))).toBe(true)
  })

  it("names a run without a seed as such", () => {
    const run = finishedRun({ createdAt: "2026-03-04T05:00:00Z", seed: null, files: ["a.png"] })
    setOutputVerdict(handle.db, run.outputs[0].id, "good")
    const destination = join(dir, "picked")

    exportGoodOutputs({ db: handle.db, projectDirectory: project, workflowId, destination })

    expect(readdirSync(destination)).toEqual(["h3-r2v-base-adhoc-noseed-a.png"])
  })

  it("numbers names taken in the folder or by another output of the same export", () => {
    const first = finishedRun({ createdAt: "2026-03-04T06:00:00Z", seed: 5, files: ["a.png"] })
    const second = finishedRun({ createdAt: "2026-03-04T05:00:00Z", seed: 5, files: ["a.png"] })
    setOutputVerdict(handle.db, first.outputs[0].id, "good")
    setOutputVerdict(handle.db, second.outputs[0].id, "good")
    const destination = join(dir, "picked")
    mkdirSync(destination)
    writeFileSync(join(destination, "h3-r2v-base-adhoc-s5-a.png"), "already here")

    const result = exportGoodOutputs({
      db: handle.db,
      projectDirectory: project,
      workflowId,
      destination,
    })

    expect(result).toEqual({
      state: "written",
      paths: [
        join(destination, "h3-r2v-base-adhoc-s5-a-2.png"),
        join(destination, "h3-r2v-base-adhoc-s5-a-3.png"),
      ],
    })
    expect(readFileSync(join(destination, "h3-r2v-base-adhoc-s5-a.png"), "utf8")).toBe(
      "already here"
    )
    expect(readFileSync(join(destination, "h3-r2v-base-adhoc-s5-a-3.png"), "utf8")).toBe(
      `a.png of run ${second.id}`
    )
  })

  it("writes new copies beside the old when exporting to the same folder again", () => {
    const run = finishedRun({ createdAt: "2026-03-04T05:00:00Z", seed: 5, files: ["a.png"] })
    setOutputVerdict(handle.db, run.outputs[0].id, "good")
    const destination = join(dir, "picked")
    const exportOnce = (): ReturnType<typeof exportGoodOutputs> =>
      exportGoodOutputs({ db: handle.db, projectDirectory: project, workflowId, destination })

    exportOnce()
    writeFileSync(join(destination, "h3-r2v-base-adhoc-s5-a.png"), "edited after the export")
    const again = exportOnce()

    expect(again).toEqual({
      state: "written",
      paths: [join(destination, "h3-r2v-base-adhoc-s5-a-2.png")],
    })
    expect(readFileSync(join(destination, "h3-r2v-base-adhoc-s5-a.png"), "utf8")).toBe(
      "edited after the export"
    )
  })

  it("refuses when nothing is marked good, and writes nothing", () => {
    const run = finishedRun({ createdAt: "2026-03-04T05:00:00Z", seed: 5, files: ["a.png"] })
    setOutputVerdict(handle.db, run.outputs[0].id, "bad")
    const destination = join(dir, "picked")

    expect(
      exportGoodOutputs({ db: handle.db, projectDirectory: project, workflowId, destination })
    ).toEqual({ state: "nothing" })
    expect(existsSync(destination)).toBe(false)
  })

  it("refuses before copying anything when a good output's file has gone", () => {
    const run = finishedRun({
      createdAt: "2026-03-04T05:00:00Z",
      seed: 5,
      files: ["a.png", "b.png"],
    })
    setOutputVerdict(handle.db, run.outputs[0].id, "good")
    setOutputVerdict(handle.db, run.outputs[1].id, "good")
    rmSync(join(project, run.outputs[1].path))
    const destination = join(dir, "picked")

    expect(() =>
      exportGoodOutputs({ db: handle.db, projectDirectory: project, workflowId, destination })
    ).toThrow("b.png could not be read")
    expect(existsSync(destination)).toBe(false)
  })
})
