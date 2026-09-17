import type {
  Asset,
  LineInput,
  LineKind,
  SavedShot,
  SubjectComposition,
  Vocabularies,
} from "@renderer/lib/trpc"
import type { Command } from "./command-menu"
import type { ShotFields } from "./use-clip"

/** What the menu on a line can reach beyond the line itself. */
export interface LineMenuContext {
  vocabularies: Vocabularies
  savedShots: SavedShot[]
  savedSubjects: Asset[]
  onAddSavedShot: (savedShotId: number) => void
  onAddSavedSubject: (savedId: number) => void
  onAddSubject: (name: string) => void
  onNewShot: () => void
  onSaveShot: () => void
  onSetShotField: (over: Partial<ShotFields>) => void
}

/** The part of the menu that is the same wherever in the clip it is opened. */
export type ClipMenuContext = Omit<LineMenuContext, "onSaveShot" | "onSetShotField">

/** What each kind is called in the menu, said as the line reads rather than as the data. */
const KIND_LABELS: { kind: LineKind; label: string }[] = [
  { kind: "shows", label: "Show something" },
  { kind: "action", label: "Make this something that happens" },
  { kind: "speech", label: "Make this something that is said" },
]

/** The parts of a shot picked from the target's vocabulary, as one group each. */
const SHOT_WORDS: { group: string; field: keyof ShotFields; of: keyof Vocabularies }[] = [
  { group: "Camera", field: "cameraMotion", of: "cameraMotions" },
  { group: "Lighting", field: "lighting", of: "lightings" },
  { group: "Speed", field: "speed", of: "speeds" },
  { group: "Amplitude", field: "amplitude", of: "amplitudes" },
  { group: "Cut", field: "transition", of: "transitions" },
]

interface LineCommandArgs {
  line: LineInput
  /** The word the cursor is in, which is what a new subject would be called. */
  word: string
  subjects: SubjectComposition[]
  speakers: SubjectComposition[]
  menu: LineMenuContext
  onSetKind: (kind: LineKind) => void
  onShowSubject: (subjectId: number) => void
}

/**
 * Everything that can be done from a line: what the line is, who is in it, and what the shot
 * around it is made of. Built rather than listed, so what cannot be done here is not offered.
 */
export function lineCommands({
  line,
  word,
  subjects,
  speakers,
  menu,
  onSetKind,
  onShowSubject,
}: LineCommandArgs): Command[] {
  const commands: Command[] = []

  for (const entry of KIND_LABELS) {
    if (entry.kind === line.kind) continue
    if (entry.kind === "speech" && speakers.length === 0) continue
    commands.push({
      id: `kind-${entry.kind}`,
      label: entry.label,
      group: "This line",
      run: () => onSetKind(entry.kind),
    })
  }

  for (const subject of subjects) {
    commands.push({
      id: `show-${subject.id}`,
      label: `Show ${subject.name}`,
      group: "Subjects",
      run: () => onShowSubject(subject.id),
    })
  }

  const named = word.trim()
  if (named.length > 0 && !subjects.some((subject) => subject.name === named)) {
    commands.push({
      id: "add-subject",
      label: `Add ${named} to the cast`,
      group: "Subjects",
      run: () => menu.onAddSubject(named),
    })
  }

  commands.push(
    { id: "add-shot", label: "Add shot", group: "Shot", run: menu.onNewShot },
    { id: "save-shot", label: "Save this shot to the library", group: "Shot", run: menu.onSaveShot }
  )

  for (const saved of menu.savedSubjects) {
    if (subjects.some((subject) => subject.name === saved.name)) continue
    commands.push({
      id: `saved-subject-${saved.id}`,
      label: `Add ${saved.name} from the library`,
      group: "Library",
      run: () => menu.onAddSavedSubject(saved.id),
    })
  }

  for (const saved of menu.savedShots) {
    commands.push({
      id: `saved-shot-${saved.id}`,
      label: `Add the saved shot ${saved.name}`,
      group: "Library",
      run: () => menu.onAddSavedShot(saved.id),
    })
  }

  for (const entry of SHOT_WORDS) {
    for (const option of menu.vocabularies[entry.of]) {
      commands.push({
        id: `${entry.field}-${option}`,
        label: option,
        group: entry.group,
        run: () => menu.onSetShotField({ [entry.field]: option }),
      })
    }
  }

  return commands
}

/** The word the cursor sits in, which is what the menu would offer to make a subject. */
export function wordAt(text: string, cursor: number): string {
  const before = text.slice(0, cursor).search(/\S+$/)
  const after = text.slice(cursor).search(/\s/)
  const from = before === -1 ? cursor : before
  const to = after === -1 ? text.length : cursor + after
  return text.slice(from, to)
}
