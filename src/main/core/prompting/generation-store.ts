import { desc, eq, isNull } from "drizzle-orm"
import type { ClipComposition } from "../composition/clip"
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
