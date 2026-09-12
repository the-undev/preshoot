import { asc, eq } from "drizzle-orm"
import { CompositionError } from "../composition/errors"
import { schema, type ProjectDatabase } from "../db"
import type { PromptTarget } from "./target"
import {
  builtinVariants,
  storedVariantId,
  storedVariantRowId,
  type PromptStrategy,
  type PromptVariant,
} from "./variant"

/** Every prompt that can write for `target`: the ones it ships with, then the ones written here. */
export function listVariants(db: ProjectDatabase, target: PromptTarget): PromptVariant[] {
  const stored = db
    .select()
    .from(schema.promptVariants)
    .where(eq(schema.promptVariants.targetId, target.id))
    .orderBy(asc(schema.promptVariants.name), asc(schema.promptVariants.id))
    .all()
  return [...builtinVariants(target), ...stored.map(toVariant)]
}

/** The prompt with this id, whether it ships with the target or was written here. */
export function readVariant(db: ProjectDatabase, target: PromptTarget, id: string): PromptVariant {
  const variant = listVariants(db, target).find((entry) => entry.id === id)
  if (!variant) {
    throw CompositionError.notFound(`Prompt ${id}`)
  }
  return variant
}

/** Writes a new prompt for a target, which is how a built-in one is changed: by copying it first. */
export function insertVariant(
  db: ProjectDatabase,
  input: { targetId: string; strategy: PromptStrategy; name: string; systemPrompt: string }
): PromptVariant {
  const [row] = db
    .insert(schema.promptVariants)
    .values({ ...input, createdAt: new Date() })
    .returning()
    .all()
  return toVariant(row)
}

/** Rewrites a prompt written here. The ones a target ships with cannot be changed. */
export function updateVariant(
  db: ProjectDatabase,
  input: { id: string; name: string; systemPrompt: string }
): PromptVariant {
  const rowId = storedVariantRowId(input.id)
  if (rowId === null) {
    throw CompositionError.notFound(`Prompt ${input.id} cannot be changed`)
  }
  const [row] = db
    .update(schema.promptVariants)
    .set({ name: input.name, systemPrompt: input.systemPrompt })
    .where(eq(schema.promptVariants.id, rowId))
    .returning()
    .all()
  if (!row) {
    throw CompositionError.notFound(`Prompt ${input.id}`)
  }
  return toVariant(row)
}

/** Removes a prompt written here. */
export function deleteVariant(db: ProjectDatabase, id: string): void {
  const rowId = storedVariantRowId(id)
  if (rowId === null) {
    throw CompositionError.notFound(`Prompt ${id} cannot be removed`)
  }
  const removed = db
    .delete(schema.promptVariants)
    .where(eq(schema.promptVariants.id, rowId))
    .returning()
    .all()
  if (removed.length === 0) {
    throw CompositionError.notFound(`Prompt ${id}`)
  }
}

type VariantRow = typeof schema.promptVariants.$inferSelect

function toVariant(row: VariantRow): PromptVariant {
  return {
    id: storedVariantId(row.id),
    targetId: row.targetId,
    strategy: row.strategy as PromptStrategy,
    name: row.name,
    systemPrompt: row.systemPrompt,
    editable: true,
  }
}
