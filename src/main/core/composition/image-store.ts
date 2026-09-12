import { randomBytes } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { extname, join } from "node:path"
import { asc, eq } from "drizzle-orm"
import { schema, type ProjectDatabase } from "../db"
import { CompositionError } from "./errors"

/** What can be attached, and what each is served as. */
export const IMAGE_MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

/** Where a project keeps the pictures of its library. */
export function projectImagesPath(directory: string): string {
  return join(directory, "assets", "images")
}

/** One reference picture, with the name of the file that holds it. */
export interface AssetImage {
  id: number
  assetId: number
  fileName: string
  mediaType: string
  position: number
}

/** Copies a picture into the project and hangs it on a library thing. */
export function importImage(
  db: ProjectDatabase,
  input: { directory: string; assetId: number; sourcePath: string }
): AssetImage {
  const mediaType = IMAGE_MEDIA_TYPES[extname(input.sourcePath).toLowerCase()]
  if (!mediaType) {
    throw CompositionError.notFound(`${input.sourcePath} is not a picture this project can hold`)
  }

  const asset = db.select().from(schema.assets).where(eq(schema.assets.id, input.assetId)).get()
  if (!asset) {
    throw CompositionError.notFound(`Thing ${input.assetId}`)
  }

  // A name of its own, so importing the same file twice keeps both rather than one overwriting
  // the other, and so a file name from anywhere cannot reach outside the folder.
  const fileName = `${input.assetId}-${randomBytes(8).toString("hex")}${extname(input.sourcePath).toLowerCase()}`
  const directory = projectImagesPath(input.directory)
  mkdirSync(directory, { recursive: true })
  copyFileSync(input.sourcePath, join(directory, fileName))

  const [row] = db
    .insert(schema.assetImages)
    .values({
      assetId: input.assetId,
      fileName,
      mediaType,
      position: listImages(db, input.assetId).length,
      createdAt: new Date(),
    })
    .returning()
    .all()
  return toImage(row)
}

/** The pictures of one library thing, in the order they were added. */
export function listImages(db: ProjectDatabase, assetId: number): AssetImage[] {
  return db
    .select()
    .from(schema.assetImages)
    .where(eq(schema.assetImages.assetId, assetId))
    .orderBy(asc(schema.assetImages.position), asc(schema.assetImages.id))
    .all()
    .map(toImage)
}

/** Every picture in the project, for showing the library in one go. */
export function listAllImages(db: ProjectDatabase): AssetImage[] {
  return db
    .select()
    .from(schema.assetImages)
    .orderBy(asc(schema.assetImages.assetId), asc(schema.assetImages.position))
    .all()
    .map(toImage)
}

/** One picture and where its file is, for serving it to the renderer. */
export function readImage(
  db: ProjectDatabase,
  directory: string,
  imageId: number
): { image: AssetImage; path: string } {
  const row = db.select().from(schema.assetImages).where(eq(schema.assetImages.id, imageId)).get()
  if (!row) {
    throw CompositionError.notFound(`Picture ${imageId}`)
  }
  return { image: toImage(row), path: join(projectImagesPath(directory), row.fileName) }
}

/** Removes a picture and the file behind it. */
export function deleteImage(db: ProjectDatabase, directory: string, imageId: number): void {
  const { image } = readImage(db, directory, imageId)
  db.delete(schema.assetImages).where(eq(schema.assetImages.id, imageId)).run()
  removeFile(directory, image.fileName)
}

/** Removes every picture of a library thing, so nothing is left behind when it goes. */
export function deleteImagesOfAsset(db: ProjectDatabase, directory: string, assetId: number): void {
  for (const image of listImages(db, assetId)) {
    db.delete(schema.assetImages).where(eq(schema.assetImages.id, image.id)).run()
    removeFile(directory, image.fileName)
  }
}

function removeFile(directory: string, fileName: string): void {
  const path = join(projectImagesPath(directory), fileName)
  if (existsSync(path)) {
    rmSync(path)
  }
}

type ImageRow = typeof schema.assetImages.$inferSelect

function toImage(row: ImageRow): AssetImage {
  return {
    id: row.id,
    assetId: row.assetId,
    fileName: row.fileName,
    mediaType: row.mediaType,
    position: row.position,
  }
}
