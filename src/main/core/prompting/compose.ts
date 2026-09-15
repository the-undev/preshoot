import type { ClipComposition } from "../composition/clip"
import { CompositionError } from "../composition/errors"
import { buildRequest, type GenerationRequest } from "../composition/request"
import { renderPrompt, type PromptTarget, type TargetFields } from "./target"

/**
 * The prompt a clip makes, or why it cannot make one yet. A clip is written as it is edited, so
 * an unfinished one is an ordinary state rather than a failure.
 */
export type ClipPrompt =
  | { ready: true; fields: TargetFields; rendered: string; request: GenerationRequest }
  | { ready: false; reason: string }

/** Turns a clip into its target's prompt. Nothing here calls a model: the same clip always writes the same prompt. */
export function composeClip(composition: ClipComposition, target: PromptTarget): ClipPrompt {
  if (composition.shots.length === 0) {
    return { ready: false, reason: "This clip has no shots." }
  }

  try {
    const fields = target.assemble(composition)
    const rendered = renderPrompt(target, composition, fields)
    return { ready: true, fields, rendered, request: buildRequest(composition, rendered) }
  } catch (error) {
    if (error instanceof CompositionError) {
      return { ready: false, reason: error.message }
    }
    throw error
  }
}
