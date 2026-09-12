import { desc, eq, isNull } from "drizzle-orm"
import type { ClipComposition } from "../composition/clip"
import { CompositionError } from "../composition/errors"
import type { ClipProse } from "../composition/prose"
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
  prose: ClipProse | null
  rendered: string
  model: string | null
  runId: string | null
  promptVariantId: string | null
  systemPrompt: string | null
  verdict: string | null
  note: string
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

/** Marks a generation good or bad and keeps a note against it. */
export function judgeGeneration(
  db: ProjectDatabase,
  input: { id: number; verdict: string | null; note: string }
): GenerationRecord {
  const [row] = db
    .update(schema.generations)
    .set({ verdict: input.verdict, note: input.note })
    .where(eq(schema.generations.id, input.id))
    .returning()
    .all()
  if (!row) {
    throw CompositionError.notFound(`Prompt ${input.id}`)
  }
  return toRecord(row)
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
