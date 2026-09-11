/** Last segment of a folder path, used as the suggested project name. */
export function folderName(directory: string): string {
  const segments = directory.split(/[/\\]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? directory
}
