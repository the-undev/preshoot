/** A node as the replacements look it up: by its search name or its title, then by input name. */
export interface NamedNode {
  searchName: string | null
  title: string | null
  inputs: Record<string, unknown>
}

/**
 * Fills the `%date:FORMAT%` and `%Node.widget%` markers ComfyUI's editor fills in a
 * `filename_prefix` before it queues, so a run saves where the workflow would. A marker that names
 * nothing is left as it is, as the editor leaves it.
 */
export function fillFilenamePrefix(text: string, nodes: NamedNode[], now: Date): string {
  return text.replace(/%([^%]+)%/g, (marker, body: string) => {
    if (body.startsWith("date:")) return formatDate(body.slice("date:".length), now)
    const [nodeName, inputName] = body.split(".")
    if (inputName === undefined) return marker
    const node =
      nodes.find((candidate) => candidate.searchName === nodeName) ??
      nodes.find((candidate) => candidate.title === nodeName)
    const value = node?.inputs[inputName]
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return marker
    }
    return String(value).replace(/[/\\]/g, "_")
  })
}

/** Writes `now` in a format such as `yyyy-MM-dd` or `hhmmss`, the tokens ComfyUI's editor reads. */
function formatDate(format: string, now: Date): string {
  const parts: Record<string, number> = {
    d: now.getDate(),
    M: now.getMonth() + 1,
    h: now.getHours(),
    m: now.getMinutes(),
    s: now.getSeconds(),
  }
  return format.replace(/yyyy|yy|dd|d|MM|M|hh|h|mm|m|ss|s/g, (token) => {
    if (token === "yyyy") return String(now.getFullYear())
    if (token === "yy") return String(now.getFullYear()).slice(-2)
    const value = String(parts[token[0]])
    return token.length === 2 ? value.padStart(2, "0") : value
  })
}
