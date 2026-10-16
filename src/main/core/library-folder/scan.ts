import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs"
import { basename, extname, join, relative, resolve } from "node:path"
import { mediaOf, type LibraryMedia } from "./media"

/** The file in an entry folder that holds its notes rather than being one of its files. */
export const NOTES_FILE = "entry.md"

/** One file of an entry. */
export interface LibraryFile {
  /** Where it sits under the entry, which for a file of its own is its name. */
  name: string
  path: string
  /** Where it sits under the library folder, which is how the renderer asks for it. */
  relativePath: string
  media: LibraryMedia
}

/** A folder under a kind, or a file directly under one, with its files and its notes. */
export interface LibraryEntry {
  kind: string
  name: string
  path: string
  notes: string | null
  files: LibraryFile[]
}

/** A top-level folder of the library, which is a shelf label and nothing more. */
export interface LibraryKind {
  name: string
  entries: LibraryEntry[]
}

/** What the library folder holds, or why nothing can be listed. */
export type LibraryFolder =
  | { state: "unset" }
  | { state: "missing"; folder: string }
  | { state: "listed"; folder: string; kinds: LibraryKind[] }

/**
 * Reads the library folder as it is now. Its top-level folders are kinds, a folder under a kind is
 * an entry, and a file directly under a kind is an entry of its own. The folder is only read.
 * Hidden entries and symbolic links are passed over, so nothing listed leads outside it.
 */
export function scanLibraryFolder(folder: string | null): LibraryFolder {
  if (folder === null) return { state: "unset" }
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return { state: "missing", folder }

  const kinds = visible(folder)
    .filter((entry) => entry.isDirectory())
    .map((entry) => readKind(folder, entry.name))
  return { state: "listed", folder, kinds }
}

/** The entry at `path` in a listing, or nothing when the listing has none there. */
export function findEntry(listing: LibraryFolder, path: string): LibraryEntry | null {
  if (listing.state !== "listed") return null
  const wanted = resolve(path)
  for (const kind of listing.kinds) {
    const entry = kind.entries.find((candidate) => resolve(candidate.path) === wanted)
    if (entry) return entry
  }
  return null
}

function readKind(folder: string, kind: string): LibraryKind {
  const kindPath = join(folder, kind)
  const entries = visible(kindPath).flatMap((entry): LibraryEntry[] => {
    const path = join(kindPath, entry.name)
    if (entry.isDirectory()) return [readFolderEntry(folder, kind, path)]
    if (!entry.isFile()) return []
    return [
      {
        kind,
        name: basename(entry.name, extname(entry.name)),
        path,
        notes: null,
        files: [toFile(folder, path, entry.name)],
      },
    ]
  })
  return { name: kind, entries }
}

function readFolderEntry(folder: string, kind: string, path: string): LibraryEntry {
  const notesPath = join(path, NOTES_FILE)
  const hasNotes = visible(path).some((entry) => entry.isFile() && entry.name === NOTES_FILE)
  const files = filesUnder(path)
    .filter((file) => file !== notesPath)
    .map((file) => toFile(folder, file, relative(path, file)))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    kind,
    name: basename(path),
    path,
    notes: hasNotes ? readFileSync(notesPath, "utf8").trim() : null,
    files,
  }
}

function toFile(folder: string, path: string, name: string): LibraryFile {
  return { name, path, relativePath: relative(folder, path), media: mediaOf(path) }
}

/** Every file under `directory`, walking its folders, without hidden entries or links. */
function filesUnder(directory: string): string[] {
  return visible(directory).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return entry.isFile() ? [path] : []
  })
}

/** What a folder holds, by name, leaving out hidden entries and symbolic links. */
function visible(directory: string): Dirent[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith(".") && !entry.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name))
}
