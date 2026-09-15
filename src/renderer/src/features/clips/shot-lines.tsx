import { useEffect, useRef, useState } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, GripVertical, MessageSquare, Plus, Trash2 } from "lucide-react"
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/design-system"
import type { Asset, LineComposition, LineInput, SpeakerComposition } from "@renderer/lib/trpc"
import { asLineInput } from "./line-input"

/** Stands for a line about the scene rather than about anyone in particular. */
const NOBODY = "nobody"

/** What can be said about a spoken line beyond who says it and what it says. */
const FLAGS = [
  { key: "offScreen", label: "Off screen" },
  { key: "crossesCut", label: "Carries across the cut" },
  { key: "cutOff", label: "Cut off by the end" },
] as const

/** An empty line of `kind`, ready to type into. */
function emptyLine(kind: LineInput["kind"], speakers: SpeakerComposition[]): LineInput {
  return {
    kind,
    assetId: null,
    speakerIds: kind === "speech" && speakers[0] ? [speakers[0].id] : [],
    text: "",
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

interface ShotLinesProps {
  shotId: number
  lines: LineComposition[]
  subjects: Asset[]
  speakers: SpeakerComposition[]
  onChange: (lines: LineInput[]) => void
}

/**
 * What happens in a shot, in order, with what is said among it rather than after it. Enter makes
 * the next line and backspace on an empty one takes it away, so a shot is written by typing rather
 * than by adding lines and then putting them in order.
 */
export function ShotLines({
  shotId,
  lines,
  subjects,
  speakers,
  onChange,
}: ShotLinesProps): React.JSX.Element {
  // What is being typed, until it is written and comes back, the same as the other fields of a shot.
  const [draft, setDraft] = useState<{ from: string; lines: LineInput[] } | null>(null)
  // Which line to put the cursor in, once the list holding it has been drawn. A ref rather than
  // state, so landing the cursor does not ask for another render of its own.
  const focusAt = useRef<number | null>(null)
  const boxes = useRef(new Map<number, HTMLInputElement>())
  const written = JSON.stringify(lines)
  const shown = draft?.from === written ? draft.lines : lines.map(asLineInput)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (focusAt.current === null) return
    boxes.current.get(focusAt.current)?.focus()
    focusAt.current = null
  }, [written])

  /** Holds a change to the text until the line is left, so a keystroke is not a round trip. */
  const type = (at: number, line: LineInput): void => {
    setDraft({
      from: written,
      lines: shown.map((existing, index) => (index === at ? line : existing)),
    })
  }

  const commit = (): void => {
    if (draft?.from === written) onChange(draft.lines)
  }

  /** Everything but the text is written straight away, since none of it is typed. */
  const write = (at: number, line: LineInput): void => {
    onChange(shown.map((existing, index) => (index === at ? line : existing)))
  }

  const insertAfter = (at: number, kind: LineInput["kind"]): void => {
    focusAt.current = at + 1
    onChange([...shown.slice(0, at + 1), emptyLine(kind, speakers), ...shown.slice(at + 1)])
  }

  const remove = (at: number): void => {
    if (at > 0) focusAt.current = at - 1
    onChange(shown.filter((_, index) => index !== at))
  }

  function dropped(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = Number(active.id)
    const to = Number(over.id)
    const ordered = [...shown]
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    onChange(ordered)
  }

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={dropped}
      >
        <SortableContext
          items={shown.map((_, index) => index)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col">
            {shown.map((line, index) => (
              <LineRow
                key={index}
                shotId={shotId}
                line={line}
                index={index}
                subjects={subjects}
                speakers={speakers}
                boxRef={(box) => {
                  if (box) boxes.current.set(index, box)
                  else boxes.current.delete(index)
                }}
                onType={(next) => type(index, next)}
                onCommit={commit}
                onWrite={(next) => write(index, next)}
                onEnter={() => insertAfter(index, line.kind)}
                onRemove={() => remove(index)}
                onInsertAfter={(kind) => insertAfter(index, kind)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Add something that happens"
          onClick={() => insertAfter(shown.length - 1, "action")}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Add a line of dialogue"
          disabled={speakers.length === 0}
          title={speakers.length === 0 ? "Add a speaker to the clip first" : undefined}
          onClick={() => insertAfter(shown.length - 1, "speech")}
        >
          <MessageSquare className="size-4" />
        </Button>
      </div>
    </div>
  )
}

interface LineRowProps {
  shotId: number
  line: LineInput
  index: number
  subjects: Asset[]
  speakers: SpeakerComposition[]
  boxRef: (box: HTMLInputElement | null) => void
  onType: (line: LineInput) => void
  onCommit: () => void
  onWrite: (line: LineInput) => void
  onEnter: () => void
  onRemove: () => void
  onInsertAfter: (kind: LineInput["kind"]) => void
}

/** One line: who it is about, what it says, and what else is true of it when it is spoken. */
function LineRow({
  shotId,
  line,
  index,
  subjects,
  speakers,
  boxRef,
  onType,
  onCommit,
  onWrite,
  onEnter,
  onRemove,
  onInsertAfter,
}: LineRowProps): React.JSX.Element {
  const [showFlags, setShowFlags] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: index,
  })

  const speaking = line.kind === "speech"

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex flex-col rounded ${isDragging ? "z-10 bg-accent" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-1 py-0.5">
        <button
          type="button"
          aria-label={`Reorder line ${index + 1}`}
          className="cursor-grab text-muted-foreground opacity-40 group-focus-within:opacity-100 group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        {speaking ? (
          <Select
            value={String(line.speakerIds[0] ?? speakers[0]?.id ?? "")}
            onValueChange={(value) => onWrite({ ...line, speakerIds: [Number(value)] })}
          >
            <SelectTrigger aria-label={`Who says line ${index + 1}`} className="w-40 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {speakers.map((speaker) => (
                <SelectItem key={speaker.id} value={String(speaker.id)}>
                  {speaker.label} {speaker.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select
            value={line.assetId === null ? NOBODY : String(line.assetId)}
            onValueChange={(value) =>
              onWrite({ ...line, assetId: value === NOBODY ? null : Number(value) })
            }
          >
            <SelectTrigger aria-label={`Who line ${index + 1} is about`} className="w-40 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>The scene</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={String(subject.id)}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {speaking && <span className="shrink-0 text-xs text-muted-foreground">says</span>}

        <Input
          ref={boxRef}
          className="min-w-40 flex-1"
          aria-label={`Line ${index + 1} of shot ${shotId}`}
          value={line.text}
          onChange={(event) => onType({ ...line, text: event.target.value })}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              onCommit()
              onEnter()
              return
            }
            // Backspace on an empty line takes it away, the way a list in a text editor does.
            if (event.key === "Backspace" && line.text.length === 0) {
              event.preventDefault()
              onRemove()
            }
          }}
        />

        {speaking && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`More about line ${index + 1}`}
            aria-expanded={showFlags}
            onClick={() => setShowFlags(!showFlags)}
          >
            <ChevronDown className="size-4" />
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          aria-label={`Remove line ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {speaking && showFlags && (
        <div className="flex flex-wrap items-center gap-4 pb-2 pl-6">
          {FLAGS.map((flag) => (
            <div key={flag.key} className="flex items-center gap-2">
              <Checkbox
                id={`line-${shotId}-${index}-${flag.key}`}
                checked={line[flag.key]}
                onCheckedChange={(checked) => onWrite({ ...line, [flag.key]: checked === true })}
              />
              <Label
                htmlFor={`line-${shotId}-${index}-${flag.key}`}
                className="text-xs font-normal"
              >
                {flag.label}
              </Label>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Label htmlFor={`line-${shotId}-${index}-language`} className="text-xs font-normal">
              Language
            </Label>
            <Input
              id={`line-${shotId}-${index}-language`}
              className="h-7 w-28"
              placeholder="As the clip"
              value={line.language ?? ""}
              onChange={(event) => onType({ ...line, language: event.target.value })}
              onBlur={() => {
                onWrite({ ...line, language: line.language?.trim() || null })
              }}
            />
          </div>
        </div>
      )}

      {/* A plus in the gap adds a line here rather than at the end, for when the mouse is already there. */}
      <div className="flex h-0 items-center gap-1 overflow-hidden opacity-0 group-hover:h-6 group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label={`Add something that happens after line ${index + 1}`}
          onClick={() => onInsertAfter("action")}
        >
          <Plus className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label={`Add a line of dialogue after line ${index + 1}`}
          disabled={speakers.length === 0}
          onClick={() => onInsertAfter("speech")}
        >
          <MessageSquare className="size-3" />
        </Button>
      </div>
    </div>
  )
}
