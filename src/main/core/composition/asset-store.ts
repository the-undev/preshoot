import { asc, eq, isNull } from "drizzle-orm"
import { schema, type ProjectDatabase } from "../db"
import { CompositionError } from "./errors"
import { deleteImagesOfAsset } from "./image-store"

/** What a library thing can be. */
export const ASSET_KINDS = ["person", "place", "object"] as const

export type AssetKind = (typeof ASSET_KINDS)[number]

/** One subject, with the time as an ISO string since it crosses to the renderer. */
export interface AssetRecord {
  id: number
  /** The clip it belongs to, or nothing when it is saved in the library as a starting point. */
  clipId: number | null
  kind: string
  name: string
  description: string
  voice: string | null
  createdAt: string
}

type AssetRow = typeof schema.assets.$inferSelect

/** The subjects saved in the library, by kind then name. A clip's own are read with the clip. */
export function listSavedAssets(db: ProjectDatabase): AssetRecord[] {
  return db
    .select()
    .from(schema.assets)
    .where(isNull(schema.assets.clipId))
    .orderBy(asc(schema.assets.kind), asc(schema.assets.name))
    .all()
    .map(toRecord)
}

/** One subject by id, whether it belongs to a clip or to the library. */
export function readAsset(db: ProjectDatabase, id: number): AssetRecord | null {
  const row = db.select().from(schema.assets).where(eq(schema.assets.id, id)).get()
  return row ? toRecord(row) : null
}

/** The subjects one clip holds, by kind then name. */
export function listCast(db: ProjectDatabase, clipId: number): AssetRecord[] {
  return db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.clipId, clipId))
    .orderBy(asc(schema.assets.kind), asc(schema.assets.name))
    .all()
    .map(toRecord)
}

/** Adds a subject, to a clip or to the library when no clip is named. */
export function insertAsset(
  db: ProjectDatabase,
  input: { clipId: number | null; kind: string; name: string; description: string }
): AssetRecord {
  const [row] = db
    .insert(schema.assets)
    .values({ ...input, voice: null, createdAt: new Date() })
    .returning()
    .all()
  return toRecord(row)
}

/** Rewrites a subject. */
export function updateAsset(
  db: ProjectDatabase,
  input: { id: number; kind: string; name: string; description: string; voice: string | null }
): AssetRecord {
  const [row] = db
    .update(schema.assets)
    .set({
      kind: input.kind,
      name: input.name,
      description: input.description,
      voice: input.voice,
    })
    .where(eq(schema.assets.id, input.id))
    .returning()
    .all()
  if (!row) {
    throw CompositionError.notFound(`Subject ${input.id}`)
  }
  return toRecord(row)
}

/**
 * Copies a subject, with its pictures, into `clipId`, or into the library when no clip is named.
 * A copy is what makes a saved subject a starting point: changing it here changes nothing there.
 */
export function copyAsset(
  db: ProjectDatabase,
  sourceId: number,
  clipId: number | null
): AssetRecord {
  return db.transaction((tx) => {
    const source = tx.select().from(schema.assets).where(eq(schema.assets.id, sourceId)).get()
    if (!source) {
      throw CompositionError.notFound(`Subject ${sourceId}`)
    }

    const copy = tx
      .insert(schema.assets)
      .values({ ...source, id: undefined, clipId, createdAt: new Date() })
      .returning()
      .get()

    for (const picture of tx
      .select()
      .from(schema.assetImages)
      .where(eq(schema.assetImages.assetId, sourceId))
      .all()) {
      tx.insert(schema.assetImages)
        .values({ ...picture, id: undefined, assetId: copy.id })
        .run()
    }
    return toRecord(copy)
  })
}

/**
 * Removes a subject, its pictures, and its place in the shots and lines that named it. A subject
 * belongs to one clip, so taking it out of the cast takes it out of that clip and nowhere else.
 */
export function deleteAsset(db: ProjectDatabase, directory: string, id: number): void {
  const asset = db.select().from(schema.assets).where(eq(schema.assets.id, id)).get()
  if (!asset) {
    throw CompositionError.notFound(`Subject ${id}`)
  }

  deleteImagesOfAsset(db, directory, id)
  db.transaction((tx) => {
    // Nothing points at a subject from a line, so the lines that named it are edited by hand.
    for (const line of tx.select().from(schema.shotLines).all()) {
      if (!line.subjectIds.includes(id)) continue
      const left = line.subjectIds.filter((entry) => entry !== id)
      if (line.kind === "speech" && left.length === 0) {
        tx.delete(schema.shotLines).where(eq(schema.shotLines.id, line.id)).run()
        continue
      }
      tx.update(schema.shotLines)
        .set({ subjectIds: left })
        .where(eq(schema.shotLines.id, line.id))
        .run()
    }
    tx.delete(schema.assets).where(eq(schema.assets.id, id)).run()
  })
}

function toRecord(row: AssetRow): AssetRecord {
  return { ...row, createdAt: row.createdAt.toISOString() }
}
