import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"
import { basename, extname, join } from "node:path"

/** What the two files of an export are called, without their extensions. */
export function promptFileName(input: { clipName: string; createdAt: string }): string {
  const name = slug(input.clipName)
  const when = input.createdAt.replace(/[:.]/g, "-").replace(/z$/i, "")
  return `${name.length > 0 ? name : "prompt"}-${when}`
}

/** `text` as one lower-case word run, safe as a file name on any of the platforms this runs on. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** Where an exported prompt, its metadata and any pictures it names went. */
export interface ExportedPrompt {
  textPath: string
  metaPath: string
  picturePaths: string[]
}

/** A picture the prompt names, which has to travel with it. */
export interface ExportPicture {
  role: string
  sourcePath: string
  extension: string
}

/**
 * Writes the prompt on its own, so it can be pasted straight into the model's own form, and its
 * metadata beside it.
 */
export function writePromptFiles(input: {
  directory: string
  baseName: string
  rendered: string
  meta: Record<string, unknown>
  pictures: ExportPicture[]
}): ExportedPrompt {
  mkdirSync(input.directory, { recursive: true })
  const textPath = join(input.directory, `${input.baseName}.txt`)
  const metaPath = join(input.directory, `${input.baseName}.json`)

  // The prompt names its pictures, so it is no use on its own.
  const picturePaths = input.pictures.map((picture) => {
    const path = join(input.directory, `${input.baseName}-${picture.role}${picture.extension}`)
    copyFileSync(picture.sourcePath, path)
    return path
  })

  writeFileSync(textPath, `${input.rendered.trimEnd()}\n`, "utf8")
  writeFileSync(
    metaPath,
    `${JSON.stringify({ ...input.meta, pictures: picturePaths.map((path) => basename(path)) }, null, 2)}\n`,
    "utf8"
  )
  return { textPath, metaPath, picturePaths }
}

/** The extension a stored picture keeps when it is exported beside its prompt. */
export function pictureExtension(fileName: string): string {
  return extname(fileName)
}
