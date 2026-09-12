import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

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

/** Where an exported prompt and its metadata went. */
export interface ExportedPrompt {
  textPath: string
  metaPath: string
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
}): ExportedPrompt {
  mkdirSync(input.directory, { recursive: true })
  const textPath = join(input.directory, `${input.baseName}.txt`)
  const metaPath = join(input.directory, `${input.baseName}.json`)
  writeFileSync(textPath, `${input.rendered.trimEnd()}\n`, "utf8")
  writeFileSync(metaPath, `${JSON.stringify(input.meta, null, 2)}\n`, "utf8")
  return { textPath, metaPath }
}
