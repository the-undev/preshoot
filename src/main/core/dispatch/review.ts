import { constants, copyFileSync, existsSync, mkdirSync } from "node:fs"
import { basename, join } from "node:path"
import { and, asc, count, desc, eq, isNull, type SQL } from "drizzle-orm"
import { schema, type ProjectDb } from "../db"
import { DispatchError } from "./errors"
import { toOutput, type RunOutput, type Verdict } from "./run-store"

/** Which outputs a listing keeps: all of them, those with one verdict, or those with none. */
export const VERDICT_FILTERS = ["all", "good", "bad", "unmarked"] as const

export type VerdictFilter = (typeof VERDICT_FILTERS)[number]

/** How many of a workflow's outputs each filter keeps. */
export type VerdictCounts = Record<VerdictFilter, number>

/** An output with the seed and the configuration of the run that wrote it. */
export interface ReviewedOutput extends RunOutput {
  seed: number | null
  /** The configuration's name as it is now, or nothing for a run filled by hand. */
  configurationName: string | null
}

/** The condition each filter puts on an output's verdict. */
const VERDICT_CONDITIONS: Record<VerdictFilter, SQL | undefined> = {
  all: undefined,
  good: eq(schema.runOutputs.verdict, "good"),
  bad: eq(schema.runOutputs.verdict, "bad"),
  unmarked: isNull(schema.runOutputs.verdict),
}

/** What an export did: nothing, since no output is marked good, or the files it wrote. */
export type OutputExport = { state: "nothing" } | { state: "written"; paths: string[] }

/** Marks an output good or bad, or clears its verdict when given nothing. */
export function setOutputVerdict(
  db: ProjectDb,
  outputId: number,
  verdict: Verdict | null
): RunOutput {
  const row = db
    .update(schema.runOutputs)
    .set({ verdict })
    .where(eq(schema.runOutputs.id, outputId))
    .returning()
    .get()
  if (!row) throw DispatchError.notFound(`Output ${outputId}`)
  return toOutput(row)
}

/** Saves the note on an output, replacing what it said before. */
export function setOutputNote(db: ProjectDb, outputId: number, note: string): RunOutput {
  const row = db
    .update(schema.runOutputs)
    .set({ note })
    .where(eq(schema.runOutputs.id, outputId))
    .returning()
    .get()
  if (!row) throw DispatchError.notFound(`Output ${outputId}`)
  return toOutput(row)
}

/** The outputs of a workflow's runs that `filter` keeps, newest run first, in the run's order. */
export function listReviewedOutputs(
  db: ProjectDb,
  workflowId: number,
  filter: VerdictFilter
): ReviewedOutput[] {
  const verdictCondition = VERDICT_CONDITIONS[filter]
  return db
    .select({
      output: schema.runOutputs,
      seed: schema.runs.seed,
      configurationName: schema.configurations.name,
    })
    .from(schema.runOutputs)
    .innerJoin(schema.runs, eq(schema.runOutputs.runId, schema.runs.id))
    .leftJoin(schema.configurations, eq(schema.runs.configurationId, schema.configurations.id))
    .where(and(eq(schema.runs.workflowId, workflowId), verdictCondition))
    .orderBy(desc(schema.runs.createdAt), desc(schema.runs.id), asc(schema.runOutputs.position))
    .all()
    .map((row) => ({
      ...toOutput(row.output),
      seed: row.seed,
      configurationName: row.configurationName,
    }))
}

/** How many of a workflow's outputs are good, bad, unmarked, and in all. */
export function countVerdicts(db: ProjectDb, workflowId: number): VerdictCounts {
  const rows = db
    .select({ verdict: schema.runOutputs.verdict, outputs: count() })
    .from(schema.runOutputs)
    .innerJoin(schema.runs, eq(schema.runOutputs.runId, schema.runs.id))
    .where(eq(schema.runs.workflowId, workflowId))
    .groupBy(schema.runOutputs.verdict)
    .all()
  const counted = (verdict: Verdict | null): number =>
    rows.find((row) => row.verdict === verdict)?.outputs ?? 0
  const good = counted("good")
  const bad = counted("bad")
  const unmarked = counted(null)
  return { all: good + bad + unmarked, good, bad, unmarked }
}

/**
 * Copies every output of a workflow marked good into `destination`, newest first, each named for
 * the workflow, the configuration, the seed and the file. A name already taken gets a number, so
 * nothing there is overwritten, and the project's own files stay where they are.
 */
export function exportGoodOutputs(input: {
  db: ProjectDb
  projectDirectory: string
  workflowId: number
  destination: string
}): OutputExport {
  const chosen = listReviewedOutputs(input.db, input.workflowId, "good")
  if (chosen.length === 0) return { state: "nothing" }

  const workflow = input.db
    .select({ name: schema.workflows.name })
    .from(schema.workflows)
    .where(eq(schema.workflows.id, input.workflowId))
    .get()
  if (!workflow) throw DispatchError.notFound(`Workflow ${input.workflowId}`)

  const copies = chosen.map((output) => ({
    source: join(input.projectDirectory, output.path),
    name: exportName(workflow.name, output),
  }))
  // Checked before anything is copied, so a file gone from the project does not leave half an
  // export behind.
  const missing = copies.find((copy) => !existsSync(copy.source))
  if (missing) throw DispatchError.unreadableFile(missing.source)

  mkdirSync(input.destination, { recursive: true })
  const paths = copies.map((copy) => copyUnderFreeName(copy.source, input.destination, copy.name))
  return { state: "written", paths }
}

/** What an exported output is called: `<workflow>-<configuration or adhoc>-s<seed>-<file>`. */
export function exportName(workflowName: string, output: ReviewedOutput): string {
  const workflow = namePart(workflowName) || "workflow"
  const configuration = namePart(output.configurationName ?? "") || "adhoc"
  const seed = output.seed === null ? "noseed" : `s${output.seed}`
  const file = namePart(basename(output.sourceFilename)) || basename(output.path)
  return `${workflow}-${configuration}-${seed}-${file}`
}

/** `text` with anything a file name cannot safely hold turned into dashes. */
function namePart(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "")
}

/**
 * Copies `source` into `folder` as `name`, or as `name` with `-2`, `-3` and on before its
 * extension when that is taken. The copy refuses an existing file, so nothing is overwritten
 * even when a file appears between two attempts.
 */
function copyUnderFreeName(source: string, folder: string, name: string): string {
  const dot = name.lastIndexOf(".")
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
  for (let number = 1; ; number += 1) {
    const target = join(folder, number === 1 ? name : `${stem}-${number}${extension}`)
    try {
      copyFileSync(source, target, constants.COPYFILE_EXCL)
      return target
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
  }
}
