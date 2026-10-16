import { extname } from "node:path"

/**
 * The first of `name`, `stem-2.ext`, `stem-3.ext` and on that `claim` takes, where `claim` says
 * whether it took the candidate. The extension starts at the last dot, and a name whose only dot
 * leads it has none, so `.env` goes on to `.env-2`.
 */
export function freeName(name: string, claim: (candidate: string) => boolean): string {
  const extension = extname(name)
  const stem = name.slice(0, name.length - extension.length)
  let candidate = name
  for (let count = 2; !claim(candidate); count += 1) {
    candidate = `${stem}-${count}${extension}`
  }
  return candidate
}
