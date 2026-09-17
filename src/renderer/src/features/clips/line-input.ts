import type { LineComposition, LineInput, LineKind, SubjectComposition } from "@renderer/lib/trpc"

/** Stands for a line that names nobody in the cast and is just the words written on it. */
export const NO_SUBJECT = "no-subject"

/** A stored line as the editor sends it back, which is the same thing without its id or its names. */
export function asLineInput(line: LineComposition): LineInput {
  return {
    kind: line.kind,
    subjectIds: line.subjectIds,
    text: line.text,
    language: line.language,
    offScreen: line.offScreen,
    crossesCut: line.crossesCut,
    cutOff: line.cutOff,
  }
}

/**
 * The line with `value` picked where it says who it is about. Naming nobody leaves the line what it
 * is and holding only its own words. A line of dialogue is never offered it, because somebody has
 * to say one, and its type is what takes it back to a kind of line that needs nobody.
 */
export function withChosenSubject(line: LineInput, value: string): LineInput {
  return { ...line, subjectIds: value === NO_SUBJECT ? [] : [Number(value)] }
}

/**
 * The line as another kind. Only a spoken line has to name somebody, so one becoming spoken lands
 * on the first who can say it when whoever it was about cannot. The rest keep who they were about.
 */
export function withChosenKind(
  line: LineInput,
  kind: LineKind,
  speakers: SubjectComposition[]
): LineInput {
  if (kind !== "speech") return { ...line, kind, subjectIds: line.subjectIds.slice(0, 1) }
  const speaks = line.subjectIds.filter((id) => speakers.some((one) => one.id === id))
  if (speaks.length > 0) return { ...line, kind, subjectIds: speaks }
  return { ...line, kind, subjectIds: speakers[0] ? [speakers[0].id] : [] }
}
