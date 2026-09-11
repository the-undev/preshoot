/** Appends `segment` to `directory`, keeping whichever separator the directory already uses. */
export function joinPath(directory: string, segment: string): string {
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/"
  return `${directory.replace(/[/\\]+$/, "")}${separator}${segment}`
}
