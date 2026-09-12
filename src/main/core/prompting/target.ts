import type { ClipComposition } from "../composition/clip"
import type { ClipProse } from "../composition/prose"

/** The fields one target's prompt is made of, ready to render. */
export type TargetFields = Record<string, string>

/** Which shots a composer is writing: all of them, or one with the rest already written. */
export type ComposeScope = { kind: "all" } | { kind: "shot"; shotId: number; previous: ClipProse }

/** The words a target accepts for the parts of a shot the app can offer as a list. */
export interface Vocabularies {
  cameraMotions: readonly string[]
  amplitudes: readonly string[]
  speeds: readonly string[]
  transitions: readonly string[]
  styles: readonly string[]
  lightings: readonly string[]
}

/** Writing a whole prompt from a note alone, with no shots. */
export interface BriefStrategy {
  systemPrompt: string
  schema: Record<string, unknown>
  userMessage(note: string): string
  readFields(content: string): TargetFields
}

/** Writing the prose of each shot, with the app owning everything around it. */
export interface ProseStrategy {
  systemPrompt: string
  schema: Record<string, unknown>
  instruction(composition: ClipComposition, scope: ComposeScope): string
  readProse(content: string, composition: ClipComposition, scope: ComposeScope): ClipProse
  assemble(composition: ClipComposition, prose: ClipProse): TargetFields
  /** One shot written from the composition alone, for the way that calls no model. */
  describeShot(composition: ClipComposition, shotId: number): string
}

/** Rewriting a finished prompt with a change asked for in words. */
export interface EditStrategy {
  systemPrompt: string
  schema: Record<string, unknown>
  userMessage(previous: string, instruction: string): string
  readFields(content: string): TargetFields
}

/** One generation model the app writes prompts for. */
export interface PromptTarget {
  id: string
  name: string
  vocabularies: Vocabularies
  render(fields: TargetFields): string
  /** The line the prompt opens with, which depends on the form the clip is written for. */
  instructionLine(composition: ClipComposition): string
  brief: BriefStrategy
  prose: ProseStrategy
  edit: EditStrategy
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
