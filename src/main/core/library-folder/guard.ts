import { realpathSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { isInsideFolder } from "../workflows/folder"

/** The folder of a project that runs write their files into. */
const OUTPUTS_FOLDER = "outputs"

/**
 * Where the file at `relativePath` under the library folder really is, or nothing when no folder
 * is set or the path leads anywhere but a file inside it. Links are followed before the check, so
 * neither `..` nor a symbolic link can reach outside the folder.
 */
export function resolveLibraryFile(folder: string | null, relativePath: string): string | null {
  if (folder === null) return null
  return resolveFileInside(folder, relativePath)
}

/**
 * Where the file at `relativePath` under the open project really is, or nothing when no project
 * is open or the path leads anywhere but a file inside the project's outputs folder. The same
 * checks as the library's keep `..` and symbolic links from reaching the rest of the project.
 */
export function resolveOutputFile(
  projectDirectory: string | null,
  relativePath: string
): string | null {
  if (projectDirectory === null) return null
  const outputs = join(projectDirectory, OUTPUTS_FOLDER)
  return resolveFileInside(outputs, relative(outputs, resolve(projectDirectory, relativePath)))
}

function resolveFileInside(folder: string, relativePath: string): string | null {
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
