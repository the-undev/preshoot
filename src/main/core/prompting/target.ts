import type { ClipComposition } from "../composition/clip"

/** The fields one target's prompt is made of, ready to render. */
export type TargetFields = Record<string, string>

/** The words a target accepts for the parts of a shot the app can offer as a list. */
export interface Vocabularies {
  cameraMotions: readonly string[]
  amplitudes: readonly string[]
  speeds: readonly string[]
  transitions: readonly string[]
  styles: readonly string[]
  lightings: readonly string[]
}

/** One generation model the app writes prompts for. */
export interface PromptTarget {
  id: string
  name: string
  vocabularies: Vocabularies
  /** The prompt's fields, written from the clip and nothing else. */
  assemble(composition: ClipComposition): TargetFields
  render(fields: TargetFields): string
  /** The line the prompt opens with, which depends on the form the clip is written for. */
  instructionLine(composition: ClipComposition): string
}

/** The finished prompt: the form's opening line, when it has one, then the fields. */
export function renderPrompt(
  target: PromptTarget,
  composition: ClipComposition,
  fields: TargetFields
): string {
  const line = target.instructionLine(composition)
  const body = target.render(fields)
  return line.length > 0 ? `${line}\n\n${body}` : body
}
