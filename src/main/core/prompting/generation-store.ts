import { desc, eq, isNull } from "drizzle-orm"
import type { ClipComposition } from "../composition/clip"
import { CompositionError } from "../composition/errors"
import type { ClipProse } from "../composition/prose"
import type { GenerationRequest } from "../composition/request"
import { schema, type ProjectDatabase } from "../db"

/** One stored generation. `createdAt` is an ISO string because the record crosses to the renderer. */
export interface GenerationRecord {
  id: number
  target: string
  composer: string
  clipId: number | null
  brief: string
  fields: Record<string, string>
  composition: ClipComposition | null
  request: GenerationRequest | null
  prose: ClipProse | null
  rendered: string
  model: string | null
  runId: string | null
  promptVariantId: string | null
  systemPrompt: string | null
  verdict: string | null
  note: string
  parentId: number | null
  editInstruction: string | null
  createdAt: string
}

/** Stores one generation and returns it as it was written. */
export function insertGeneration(
  db: ProjectDatabase,
  input: Omit<GenerationRecord, "id" | "createdAt">
): GenerationRecord {
  const [row] = db
    .insert(schema.generations)
    .values({ ...input, createdAt: new Date() })
    .returning()
    .all()
  return toRecord(row)
}

/** What has been generated for one clip, newest first. A null clip means the rows milestone 2 wrote. */
export function listGenerations(db: ProjectDatabase, clipId: number | null): GenerationRecord[] {
  return db
    .select()
    .from(schema.generations)
    .where(
      clipId === null ? isNull(schema.generations.clipId) : eq(schema.generations.clipId, clipId)
    )
    .orderBy(desc(schema.generations.createdAt), desc(schema.generations.id))
    .all()
    .map(toRecord)
}

/** Every generation of one comparison run, oldest first, which is the order they were written in. */
export function listRun(db: ProjectDatabase, runId: string): GenerationRecord[] {
  return db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.runId, runId))
    .orderBy(schema.generations.id)
    .all()
    .map(toRecord)
}

/** Marks a generation good or bad, leaving whatever note it carries alone. */
export function setVerdict(
  db: ProjectDatabase,
  input: { id: number; verdict: string | null }
): GenerationRecord {
  return change(db, input.id, { verdict: input.verdict })
}

/** Keeps a note against a generation, leaving whatever verdict it carries alone. */
export function setNote(
  db: ProjectDatabase,
  input: { id: number; note: string }
): GenerationRecord {
  return change(db, input.id, { note: input.note })
}

function change(
  db: ProjectDatabase,
  id: number,
  fields: Partial<typeof schema.generations.$inferInsert>
): GenerationRecord {
  const [row] = db
    .update(schema.generations)
    .set(fields)
    .where(eq(schema.generations.id, id))
    .returning()
    .all()
  if (!row) {
    throw CompositionError.notFound(`Prompt ${id}`)
  }
  return toRecord(row)
}

/** One comparison run: when it went, how many ways were written and how many were liked. */
export interface RunSummary {
  runId: string
  ranAt: string
  written: number
  good: number
}

/** Every comparison run of one clip, newest first. */
export function listRuns(db: ProjectDatabase, clipId: number): RunSummary[] {
  const rows = db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.clipId, clipId))
    .orderBy(schema.generations.id)
    .all()
    .filter((row) => row.runId !== null)

  const runs = new Map<string, RunSummary>()
  for (const row of rows) {
    const runId = row.runId as string
    const run = runs.get(runId) ?? {
      runId,
      ranAt: row.createdAt.toISOString(),
      written: 0,
      good: 0,
    }
    run.written += 1
    run.good += row.verdict === "good" ? 1 : 0
    runs.set(runId, run)
  }
  return [...runs.values()].reverse()
}

/** One stored generation, or nothing when it has gone. */
export function readGeneration(db: ProjectDatabase, id: number): GenerationRecord | null {
  const row = db.select().from(schema.generations).where(eq(schema.generations.id, id)).get()
  return row ? toRecord(row) : null
}

type GenerationRow = typeof schema.generations.$inferSelect

/** Turns a stored row into the record the renderer sees. */
function toRecord(row: GenerationRow): GenerationRecord {
  return { ...row, createdAt: row.createdAt.toISOString() }
}
