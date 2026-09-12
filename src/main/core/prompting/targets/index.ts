import type { PromptTarget } from "../target"
import { minimaxH3 } from "./minimax-h3"

/** The target a new clip is written for. */
export const DEFAULT_TARGET_ID = minimaxH3.id

/** Every target the app can write prompts for, by id. */
export const TARGETS: Record<string, PromptTarget> = { [minimaxH3.id]: minimaxH3 }

/** The target with this id, or a failure naming it. */
export function targetById(id: string): PromptTarget {
  const target = TARGETS[id]
  if (!target) {
    throw new Error(`Unknown prompt target ${id}`)
  }
  return target
}
