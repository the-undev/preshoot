import { realpathSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { isInsideFolder } from "../workflows/folder"

/**
 * Where the file at `relativePath` under the library folder really is, or nothing when no folder
 * is set or the path leads anywhere but a file inside it. Links are followed before the check, so
 * neither `..` nor a symbolic link can reach outside the folder.
 */
export function resolveLibraryFile(folder: string | null, relativePath: string): string | null {
  if (folder === null) return null
  const root = realPath(folder)
  if (root === null) return null

  const asked = resolve(root, relativePath)
  if (!isInsideFolder(root, asked)) return null
  const real = realPath(asked)
  if (real === null || !isInsideFolder(root, real)) return null
  return statSync(real).isFile() ? real : null
}

function realPath(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}
