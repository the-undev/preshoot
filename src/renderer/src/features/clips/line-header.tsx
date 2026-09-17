import { useState } from "react"
import { ChevronDown, UserPlus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@renderer/design-system"
import type { LineInput, LineKind, SubjectComposition } from "@renderer/lib/trpc"
import { withChosenKind, withChosenSubject, NO_SUBJECT } from "./line-input"

/** What each kind of line is called, in the order they are offered. */
const TYPE_LABELS: { kind: LineKind; label: string }[] = [
  { kind: "shows", label: "Description" },
  { kind: "action", label: "Action" },
  { kind: "speech", label: "Dialogue" },
]

/** What a line of `kind` is called. */
function typeLabel(kind: LineKind): string {
  return TYPE_LABELS.find((entry) => entry.kind === kind)?.label ?? kind
}

/** What the control that says who a line is about is called, which depends on what the line is. */
function subjectLabel(kind: LineKind, index: number): string {
  if (kind === "speech") return `Who says line ${index + 1}`
  if (kind === "shows") return `What line ${index + 1} shows`
  return `Who line ${index + 1} is about`
}

/** The look of a word in the head of a line: quiet until it is wanted, and plainly clickable. */
const WORD =
  "flex h-5 items-center gap-0.5 rounded px-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"

interface LineHeaderProps {
  line: LineInput
  index: number
  subjects: SubjectComposition[]
  speakers: SubjectComposition[]
  onWrite: (line: LineInput) => void
}

/**
 * What a line is and who it is about, above the box rather than beside it. The type comes first
 * and never moves, so changing what a line is is always in the same place, and what follows it
 * depends on the type rather than standing in for it.
 */
export function LineHeader({
  line,
  index,
  subjects,
  speakers,
  onWrite,
}: LineHeaderProps): React.JSX.Element {
  // A line of dialogue is about whoever says it, which is the part of the cast that can.
  const speaking = line.kind === "speech"
  const choices = speaking ? speakers : subjects
  const about = choices.find((subject) => subject.id === line.subjectIds[0])

  return (
    <div className="flex min-w-0 items-center gap-1">
      <TypeWord line={line} index={index} speakers={speakers} onWrite={onWrite} />

      <SubjectWord
        label={about ? subjectLabel(line.kind, index) : `Say who line ${index + 1} is about`}
        shown={about?.name ?? null}
        line={line}
        choices={choices}
        /* Somebody has to say a line of dialogue, so it cannot be taken back to nobody here. The
           type is what takes it back to a kind of line that needs nobody. */
        clearable={!speaking}
        onWrite={onWrite}
      />
    </div>
  )
}

interface TypeWordProps {
  line: LineInput
  index: number
  speakers: SubjectComposition[]
  onWrite: (line: LineInput) => void
}

/** What kind of line it is, which is the first thing on the line and the first thing to pick. */
function TypeWord({ line, index, speakers, onWrite }: TypeWordProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`What line ${index + 1} is`} className={WORD}>
          <span className="font-medium text-foreground">{typeLabel(line.kind)}</span>
          <ChevronDown className="size-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-48 flex-col gap-0.5 p-1">
        {TYPE_LABELS.map((entry) => {
          // Somebody has to say a line of dialogue, so it waits until there is somebody to.
          const cannotSpeak = entry.kind === "speech" && speakers.length === 0
          return (
            <button
              key={entry.kind}
              type="button"
              disabled={cannotSpeak}
              title={cannotSpeak ? "Add a speaker to the clip first" : undefined}
              className={`rounded px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50 ${
                entry.kind === line.kind ? "bg-accent" : ""
              }`}
              onClick={() => {
                onWrite(withChosenKind(line, entry.kind, speakers))
                setOpen(false)
              }}
            >
              {entry.label}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

interface SubjectWordProps {
  label: string
  /** The name to read, or nothing when the line names nobody and this only offers to name one. */
  shown: string | null
  line: LineInput
  choices: SubjectComposition[]
  clearable: boolean
  onWrite: (line: LineInput) => void
}

/** Who the line is about, chosen from the clip's own cast. */
function SubjectWord({
  label,
  shown,
  line,
  choices,
  clearable,
  onWrite,
}: SubjectWordProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const choose = (value: string): void => {
    onWrite(withChosenSubject(line, value))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={WORD}>
          {shown === null ? (
            <UserPlus className="size-3.5" />
          ) : (
            <>
              <span>{shown}</span>
              <ChevronDown className="size-3 opacity-50" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-52 flex-col gap-0.5 p-1">
        {choices.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            This clip has nobody in it yet. Add one to the cast above.
          </p>
        )}
        {choices.map((subject) => (
          <button
            key={subject.id}
            type="button"
            className={`rounded px-2 py-1 text-left text-sm hover:bg-accent ${
              subject.id === line.subjectIds[0] ? "bg-accent" : ""
            }`}
            onClick={() => choose(String(subject.id))}
          >
            {subject.name}
          </button>
        ))}
        {clearable && shown !== null && (
          <button
            type="button"
            className="rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
            onClick={() => choose(NO_SUBJECT)}
          >
            Nobody
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
