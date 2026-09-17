import type { ClipComposition, LineKind } from "../composition/clip"

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

/** How long the field the model generates from should run, which each model's guide sets. */
export interface BodyLength {
  /** Which of the fields is the one the length is about. */
  field: string
  min: number
  max: number
}

/** One line of a shot, read back out of a prompt. Its subject is a name, not an id yet. */
export interface ParsedLine {
  kind: LineKind
  /** Who it is about, by the name the prompt called them, or nothing when it names nobody. */
  subject: string | null
  text: string
  language: string | null
  offScreen: boolean
  crossesCut: boolean
  cutOff: boolean
}

/** One shot, read back out of a prompt. */
export interface ParsedShot {
  durationMs: number
  lines: ParsedLine[]
}

/** One of the cast, read back out of a prompt. */
export interface ParsedSubject {
  name: string
  description: string
  voice: string | null
}

/**
 * A clip read back out of a prompt, as much of it as the text says. Nothing the text held is
 * dropped: whatever cannot be placed stays as a line, so writing the prompt again gives it back.
 */
export interface ParsedClip {
  style: string
  musicNote: string
  soundscape: string
  language: string
  cast: ParsedSubject[]
  shots: ParsedShot[]
  /** Anything in front of the fields, which is the opening line a keyframe form carries. */
  note: string
}

/** One generation model the app writes prompts for. */
export interface PromptTarget {
  id: string
  name: string
  vocabularies: Vocabularies
  body: BodyLength
  /**
   * What a shot is cut into with unless it says otherwise. A shot boundary is a cut whether or not
   * anybody says so, so a new shot is given this rather than the prompt inventing one, which lets
   * it be seen and taken away like anything else that is set.
   */
  defaultTransition: string
  /** The prompt's fields, written from the clip and nothing else. */
  assemble(composition: ClipComposition): TargetFields
  render(fields: TargetFields): string
  /** A prompt read back into a clip, as far as the text says. Never refuses: see `ParsedClip`. */
  parse(text: string): ParsedClip
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
