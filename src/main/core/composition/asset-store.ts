import { asc, eq } from "drizzle-orm"
import { schema, type ProjectDatabase } from "../db"
import { CompositionError } from "./errors"

/** What a library thing can be. */
export const ASSET_KINDS = ["person", "place", "object"] as const

export type AssetKind = (typeof ASSET_KINDS)[number]

/** One library thing, with the time as an ISO string since it crosses to the renderer. */
export interface AssetRecord {
  id: number
  kind: string
  name: string
  description: string
  createdAt: string
}

type AssetRow = typeof schema.assets.$inferSelect

/** Every library thing, by kind then name. */
export function listAssets(db: ProjectDatabase): AssetRecord[] {
  return db
    .select()
    .from(schema.assets)
    .orderBy(asc(schema.assets.kind), asc(schema.assets.name))
    .all()
    .map(toRecord)
}

/** Adds a thing the clips can refer to. */
export function insertAsset(
  db: ProjectDatabase,
  input: { kind: string; name: string; description: string }
): AssetRecord {
  const [row] = db
    .insert(schema.assets)
    .values({ ...input, createdAt: new Date() })
    .returning()
    .all()
  return toRecord(row)
}

/** Renames a thing or rewrites its description. Its kind does not change. */
export function updateAsset(
  db: ProjectDatabase,
  input: { id: number; name: string; description: string }
): AssetRecord {
  const [row] = db
    .update(schema.assets)
    .set({ name: input.name, description: input.description })
    .where(eq(schema.assets.id, input.id))
    .returning()
    .all()
  if (!row) {
    throw CompositionError.notFound(`Thing ${input.id}`)
  }
  return toRecord(row)
}

/** Removes a thing, unless a shot still shows it. */
export function deleteAsset(db: ProjectDatabase, id: number): void {
  const asset = db.select().from(schema.assets).where(eq(schema.assets.id, id)).get()
  if (!asset) {
    throw CompositionError.notFound(`Thing ${id}`)
  }

  const clipNames = db
    .select({ name: schema.clips.name })
    .from(schema.shotAssets)
    .innerJoin(schema.shots, eq(schema.shots.id, schema.shotAssets.shotId))
    .innerJoin(schema.clips, eq(schema.clips.id, schema.shots.clipId))
    .where(eq(schema.shotAssets.assetId, id))
    .all()
    .map((row) => row.name)

  if (clipNames.length > 0) {
    throw CompositionError.inUse(asset.name, [...new Set(clipNames)].join(", "))
  }

  db.delete(schema.assets).where(eq(schema.assets.id, id)).run()
}

function toRecord(row: AssetRow): AssetRecord {
  return { ...row, createdAt: row.createdAt.toISOString() }
}
