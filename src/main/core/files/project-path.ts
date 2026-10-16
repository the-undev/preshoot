import { relative, sep } from "node:path"

/** Where a file under the project folder sits, with forward slashes. */
export function projectPath(directory: string, path: string): string {
  return relative(directory, path).split(sep).join("/")
}
