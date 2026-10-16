import { existsSync, readdirSync, statSync } from "node:fs"
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path"

/** One workflow file in the user's folder, and the project's copy of it when there is one. */
export interface WorkflowFile {
  name: string
  path: string
  /** Where it sits under the folder, so two files of one name in different subfolders differ. */
  relativePath: string
  importedWorkflowId: number | null
}

/** What the workflows folder holds, or why nothing can be listed. */
export type WorkflowFolder =
  | { state: "unset" }
  | { state: "missing"; folder: string }
  | { state: "listed"; folder: string; files: WorkflowFile[] }

/**
 * The `.json` files under `folder` and its subfolders, by where they sit. The folder is only ever
 * read. Hidden entries are passed over, and symbolic links to folders are not followed.
 */
export function listWorkflowFolder(
  folder: string | null,
  imported: { id: number; sourcePath: string }[]
): WorkflowFolder {
  if (folder === null) return { state: "unset" }
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return { state: "missing", folder }

  const importedByPath = new Map(imported.map((entry) => [resolve(entry.sourcePath), entry.id]))
  const files = jsonFilesUnder(folder)
    .map((path) => ({
      name: basename(path, extname(path)),
      path,
      relativePath: relative(folder, path),
      importedWorkflowId: importedByPath.get(resolve(path)) ?? null,
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return { state: "listed", folder, files }
}

/** Whether `path` is somewhere under `folder`, so an import cannot reach outside it. */
export function isInsideFolder(folder: string, path: string): boolean {
  const relativePath = relative(resolve(folder), resolve(path))
  if (relativePath.length === 0 || isAbsolute(relativePath)) return false
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`)
}

function jsonFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return jsonFilesUnder(path)
    if (extname(entry.name).toLowerCase() !== ".json") return []
    if (entry.isFile()) return [path]
    // A link to a file is listed; a link to a folder could lead back round, so it is not walked.
    return entry.isSymbolicLink() && statSync(path, { throwIfNoEntry: false })?.isFile()
      ? [path]
      : []
  })
}
