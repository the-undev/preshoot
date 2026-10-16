/** The last part of a path, whichever separator it uses. */
export function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
