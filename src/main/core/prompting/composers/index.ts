import { assembledComposer } from "./assembled"
import { briefComposer } from "./brief"
import type { PromptComposer } from "./composer"
import { proseComposer } from "./prose"

/** The way a clip is written unless the user picks another. */
export const DEFAULT_COMPOSER_ID = proseComposer.id

/** Every way of turning a clip into a prompt, by id. */
export const COMPOSERS: Record<string, PromptComposer> = {
  [proseComposer.id]: proseComposer,
  [assembledComposer.id]: assembledComposer,
  [briefComposer.id]: briefComposer,
}

/** The composer with this id, or a failure naming it. */
export function composerById(id: string): PromptComposer {
  const composer = COMPOSERS[id]
  if (!composer) {
    throw new Error(`Unknown prompt composer ${id}`)
  }
  return composer
}
