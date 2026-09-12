import { desc } from "drizzle-orm"
import { schema, type ProjectDatabase } from "../db"

/** One stored generation. `createdAt` is an ISO string because the record crosses to the renderer. */
export interface GenerationRecord {
  id: number
  target: string
  brief: string
  fields: Record<string, string>
  rendered: string
  model: string
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

/** Every generation in the project, newest first. */
export function listGenerations(db: ProjectDatabase): GenerationRecord[] {
  return db
    .select()
    .from(schema.generations)
    .orderBy(desc(schema.generations.createdAt), desc(schema.generations.id))
    .all()
    .map(toRecord)
}

type GenerationRow = typeof schema.generations.$inferSelect

/** Turns a stored row into the record the renderer sees. */
function toRecord(row: GenerationRow): GenerationRecord {
  return { ...row, createdAt: row.createdAt.toISOString() }
}
