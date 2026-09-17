import { useEffect, useRef, useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "lucide-react"
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  FieldHelp,
} from "@renderer/design-system"
import type { ShotComposition, SubjectComposition, Vocabularies } from "@renderer/lib/trpc"
import { asLineInput } from "./line-input"
import type { ClipMenuContext } from "./line-commands"
import { shotId as shotDragId } from "./line-drag"
import { ShotChips } from "./shot-chips"
import { ShotLines } from "./shot-lines"
import type { ShotFields } from "./use-clip"

interface ShotRowProps {
  shot: ShotComposition
  index: number
  subjects: SubjectComposition[]
  speakers: SubjectComposition[]
  vocabularies: Vocabularies
  /** Whether this is the shot just added, which opens, is scrolled to and takes the cursor. */
  showing: boolean
  menu: ClipMenuContext
  onChange: (fields: ShotFields) => void
  onRemove: () => void
  onSave: () => void
}

/** One shot of the clip: how long it runs, how it is shot, and everything that happens in it. */
export function ShotRow({
  shot,
  index,
  subjects,
  speakers,
  vocabularies,
  showing,
  menu,
  onChange,
  onRemove,
  onSave,
}: ShotRowProps): React.JSX.Element {
  const [open, setOpen] = useState(index === 0 || showing)
  const card = useRef<HTMLElement>(null)

  // A shot that was just added opens where it stands, so it is brought into view as well. It
  // opens through the state it starts in rather than here, since it is new when it is shown.
  useEffect(() => {
    if (!showing) return
    card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [showing])
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shotDragId(shot.id),
  })

  /** The whole shot as it stands, with `over` applied, which is what the router expects back. */
  function commit(over: Partial<ShotFields>): void {
    onChange({
      durationMs: shot.durationMs,
      cameraMotion: shot.cameraMotion,
      amplitude: shot.amplitude,
      speed: shot.speed,
      transition: shot.transition,
      lighting: shot.lighting,
      lines: shot.lines.map(asLineInput),
      ...over,
    })
  }

  return (
    <article
      ref={(element) => {
        card.current = element
        setNodeRef(element)
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex min-w-0 flex-col gap-4 rounded-lg border p-4 ${isDragging ? "opacity-30" : ""}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <header className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Reorder shot ${index + 1}`}
            className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>

          <CollapsibleTrigger asChild>
            {/* A plain button: the design system's refuses to shrink, so the summary ran under
                the buttons beside it rather than being cut short. */}
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
            >
              {open ? (
                <ChevronDown className="size-4 shrink-0" />
              ) : (
                <ChevronRight className="size-4 shrink-0" />
              )}
              <span className="shrink-0 font-heading text-sm font-semibold">Shot {index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {summary(shot)}
              </span>
            </button>
          </CollapsibleTrigger>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Save shot ${index + 1} to the library`}
              onClick={onSave}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onRemove}
              aria-label={`Remove shot ${index + 1}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </header>

        <CollapsibleContent className="flex flex-col gap-4 pt-4">
          <ShotChips
            shot={shot}
            index={index}
            vocabularies={vocabularies}
            onChange={(over) => commit(over)}
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">What happens</span>
              <FieldHelp label="what happens">
                One thing at a time, in the order it happens, with what the shot shows and what is
                said among it. A line names one of the cast or holds its own words. Enter makes the
                next line and backspace on an empty one takes it away.
              </FieldHelp>
            </div>
            <ShotLines
              shotId={shot.id}
              lines={shot.lines}
              subjects={subjects}
              speakers={speakers}
              startFocused={showing}
              menu={{ ...menu, onSaveShot: onSave, onSetShotField: commit }}
              onChange={(lines) => commit({ lines })}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </article>
  )
}

/** What a shot is, in one line, for when it is collapsed. */
function summary(shot: ShotComposition): string {
  const seconds = `${(shot.durationMs / 1000).toFixed(1)}s`
  const first = shot.lines.find((line) => line.text.trim().length > 0)?.text.trim()
  return [seconds, shot.cameraMotion, first].filter(Boolean).join(" · ")
}
