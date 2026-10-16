import { resolveFileInside } from "../files/inside-folder"

/**
 * Where the file at `relativePath` under the library folder really is, or nothing when no folder
 * is set or the path leads anywhere but a file inside it.
 */
export function resolveLibraryFile(folder: string | null, relativePath: string): string | null {
  if (folder === null) return null
  return resolveFileInside(folder, relativePath)
}
