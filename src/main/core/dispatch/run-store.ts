import { rmSync } from "node:fs"
import { join } from "node:path"
import { asc, desc, eq, inArray } from "drizzle-orm"
import { inputsNamedByRun, removeUnnamedFiles } from "../configurations/store"
import { schema, type ProjectDatabase, type ProjectDb } from "../db"
import { mediaOf, type LibraryMedia } from "../library-folder/media"
import { DispatchError } from "./errors"
import type { SlotValue } from "./resolve"

/** Where a run stands, as the last poll of ComfyUI found it. */
export const RUN_STATES = ["queued", "running", "failed", "done"] as const

export type RunState = (typeof RUN_STATES)[number]

/** How one slot was filled for a run: whether it ran, the value sent, and the file it came from. */
export interface RecordedBinding {
  slotId: number
  slotName: string
  on: boolean
  value: SlotValue | null
  file: string | null
}

/** What a reviewer said of an output. */
export const VERDICTS = ["good", "bad"] as const

export type Verdict = (typeof VERDICTS)[number]

/** A file a run wrote, as it sits in the project, with what a reviewer said of it. */
export interface RunOutput {
  id: number
  runId: number
  path: string
  sourceFilename: string
  /** What the file holds, as far as its extension says. */
  media: LibraryMedia
  verdict: Verdict | null
  note: string
}

/** A run with its times as ISO strings, since it crosses to the renderer. */
export interface RunRecord {
  id: number
  workflowId: number
  configurationId: number | null
  /** The name of the configuration it was queued from, as that configuration is called now. */
  configurationName: string | null
  promptId: string
  state: RunState
  seed: number | null
  error: string | null
  bindings: RecordedBinding[]
  createdAt: string
  finishedAt: string | null
  outputs: RunOutput[]
}

type RunRow = typeof schema.runs.$inferSelect
type OutputRow = typeof schema.runOutputs.$inferSelect

/** Records a run ComfyUI has just queued. */
export function recordRun(
  db: ProjectDb,
  input: {
    workflowId: number
    configurationId: number | null
    promptId: string
    apiPrompt: string
    bindings: RecordedBinding[]
    seed: number | null
    createdAt: Date
  }
): RunRecord {
  const row = db
    .insert(schema.runs)
    .values({ ...input, state: "queued" })
    .returning()
    .get()
  return toRecord(row, [], configurationNames(db, [row]))
}

/** One run with its outputs. */
export function readRun(db: ProjectDb, runId: number): RunRecord {
  const row = db.select().from(schema.runs).where(eq(schema.runs.id, runId)).get()
  if (!row) throw DispatchError.notFound(`Run ${runId}`)
  return toRecord(row, outputsOf(db, [runId]), configurationNames(db, [row]))
}

/** The prompt a run posted, exactly as it was sent. */
export function readRunPrompt(db: ProjectDb, runId: number): string {
  const row = db
    .select({ apiPrompt: schema.runs.apiPrompt })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId))
    .get()
  if (!row) throw DispatchError.notFound(`Run ${runId}`)
  return row.apiPrompt
}

/** A workflow's runs, newest first, each with its outputs. */
export function listRuns(db: ProjectDb, workflowId: number): RunRecord[] {
  const rows = db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.workflowId, workflowId))
    .orderBy(desc(schema.runs.createdAt), desc(schema.runs.id))
    .all()
  const outputs = outputsOf(
    db,
    rows.map((row) => row.id)
  )
  const names = configurationNames(db, rows)
  return rows.map((row) => toRecord(row, outputs, names))
}

/** Moves an unfinished run to queued or running. A finished run stays as it is. */
export function markUnfinished(
  db: ProjectDb,
  runId: number,
  state: "queued" | "running"
): RunRecord {
  const run = readRun(db, runId)
  if (isFinished(run.state) || run.state === state) return run
  db.update(schema.runs).set({ state }).where(eq(schema.runs.id, runId)).run()
  return readRun(db, runId)
}

/** Marks an unfinished run failed, with why. A finished run stays as it is. */
export function markFailed(db: ProjectDb, runId: number, error: string, at: Date): RunRecord {
  const run = readRun(db, runId)
  if (isFinished(run.state)) return run
  db.update(schema.runs)
    .set({ state: "failed", error, finishedAt: at })
    .where(eq(schema.runs.id, runId))
    .run()
  return readRun(db, runId)
}

/**
 * Marks a run done with the files it wrote, all at once. A run already finished keeps what it
 * has, so two polls that both downloaded its files record them once.
 */
export function completeRun(
  db: ProjectDb,
  runId: number,
  outputs: { path: string; sourceFilename: string }[],
  at: Date
): RunRecord {
  return db.transaction((tx) => {
    const run = readRun(tx, runId)
    if (isFinished(run.state)) return run
    tx.update(schema.runs)
      .set({ state: "done", error: null, finishedAt: at })
      .where(eq(schema.runs.id, runId))
      .run()
    outputs.forEach((output, position) => {
      tx.insert(schema.runOutputs)
        .values({ runId, ...output, position })
        .run()
    })
    return readRun(tx, runId)
  })
}

/**
 * Deletes a finished run with its outputs and their folder, and the input files nothing else
 * names. A run still queued or running is refused, since ComfyUI may yet write its files.
 */
export function deleteRun(input: { db: ProjectDatabase; directory: string; runId: number }): void {
  const { db, directory, runId } = input
  const run = readRun(db, runId)
  if (!isFinished(run.state)) throw DispatchError.unfinished(runId)
  db.transaction((tx) => {
    tx.delete(schema.runOutputs).where(eq(schema.runOutputs.runId, runId)).run()
    tx.delete(schema.runs).where(eq(schema.runs.id, runId)).run()
  })
  rmSync(join(directory, runFolder(runId)), { recursive: true, force: true })
  removeUnnamedFiles(db, directory, inputsNamedByRun(directory, run.bindings))
}

/** The folder under the project that holds a run's files. */
export function runFolder(runId: number): string {
  return `outputs/run-${runId}`
}

/** One output of a run, for opening it. */
export function readRunOutput(db: ProjectDb, outputId: number): RunOutput {
  const row = db.select().from(schema.runOutputs).where(eq(schema.runOutputs.id, outputId)).get()
  if (!row) throw DispatchError.notFound(`Output ${outputId}`)
  return toOutput(row)
}

/** Whether a run has stopped changing. */
export function isFinished(state: RunState): boolean {
  return state === "failed" || state === "done"
}

function outputsOf(db: ProjectDb, runIds: number[]): OutputRow[] {
  if (runIds.length === 0) return []
  return db
    .select()
    .from(schema.runOutputs)
    .where(inArray(schema.runOutputs.runId, runIds))
    .orderBy(asc(schema.runOutputs.position))
    .all()
}

/** The names of the configurations `rows` were queued from, by id. */
function configurationNames(db: ProjectDb, rows: RunRow[]): Map<number, string> {
  const ids = [...new Set(rows.flatMap((row) => row.configurationId ?? []))]
  if (ids.length === 0) return new Map()
  const found = db
    .select({ id: schema.configurations.id, name: schema.configurations.name })
    .from(schema.configurations)
    .where(inArray(schema.configurations.id, ids))
    .all()
  return new Map(found.map((entry) => [entry.id, entry.name]))
}

function toRecord(row: RunRow, outputs: OutputRow[], names: Map<number, string>): RunRecord {
  return {
    id: row.id,
    workflowId: row.workflowId,
    configurationId: row.configurationId,
    configurationName:
      row.configurationId === null ? null : (names.get(row.configurationId) ?? null),
    promptId: row.promptId,
    state: row.state as RunState,
    seed: row.seed,
    error: row.error,
    bindings: row.bindings as RecordedBinding[],
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    outputs: outputs.filter((output) => output.runId === row.id).map(toOutput),
  }
}

/** A stored output as the renderer sees it. */
export function toOutput(row: OutputRow): RunOutput {
  return {
    id: row.id,
    runId: row.runId,
    path: row.path,
    sourceFilename: row.sourceFilename,
    media: mediaOf(row.path),
    verdict: row.verdict as Verdict | null,
    note: row.note,
  }
}
