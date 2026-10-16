import { constants, copyFileSync, lstatSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { extname, join } from "node:path"
import { LibraryError } from "./errors"
import { NOTES_FILE } from "./scan"

/** What a new entry is made of: its kind, its name, its notes, and the pictures to copy into it. */
export interface NewLibraryEntry {
  folder: string | null
  kind: string
  name: string
  notes: string
  pictures: string[]
}

/**
 * Writes a new entry folder under `kind`, making the kind folder when it is new, with the pictures
 * copied in and the notes as its entry.md. This is the only code in the app that writes inside the
 * library folder. An entry of that name already there is refused and nothing is overwritten.
 */
export function writeLibraryEntry(entry: NewLibraryEntry): { path: string } {
  if (entry.folder === null) throw LibraryError.unset()
  if (!statSync(entry.folder, { throwIfNoEntry: false })?.isDirectory()) {
    throw LibraryError.missing(entry.folder)
  }
  const kind = folderName(entry.kind, "A kind")
  const name = folderName(entry.name, "An entry")

  const kindPath = join(entry.folder, kind)
  const kindStat = lstatSync(kindPath, { throwIfNoEntry: false })
  // A link could lead the write outside the folder, so only a real folder is written into.
  if (kindStat && !kindStat.isDirectory()) {
    throw LibraryError.badName(`${kind} is in the library folder but is not a kind folder.`)
  }
  const entryPath = join(kindPath, name)
  if (lstatSync(entryPath, { throwIfNoEntry: false })) throw LibraryError.exists(kind, name)

  mkdirSync(kindPath, { recursive: true })
  try {
    mkdirSync(entryPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw LibraryError.exists(kind, name)
    throw error
  }

  entry.pictures.forEach((picture, index) => {
    const fileName = `${name}-${index + 1}${extname(picture).toLowerCase()}`
    copyFileSync(picture, join(entryPath, fileName), constants.COPYFILE_EXCL)
  })
  writeFileSync(join(entryPath, NOTES_FILE), `${entry.notes.trim()}\n`, { flag: "wx" })
  return { path: entryPath }
}

/** `name` trimmed, when it can be one folder inside another and nothing else. */
function folderName(name: string, what: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw LibraryError.badName(`${what} needs a name.`)
  if (/[/\\\0]/.test(trimmed) || trimmed.startsWith(".")) {
    throw LibraryError.badName(
      `${what} cannot be called ${trimmed}: a folder name cannot hold a slash or start with a dot.`
    )
  }
  return trimmed
}
