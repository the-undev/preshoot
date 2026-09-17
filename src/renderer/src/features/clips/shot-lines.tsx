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
import { ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react"
import {
  Button,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Textarea,
} from "@renderer/design-system"
import type { LineComposition, LineInput, LineKind, SubjectComposition } from "@renderer/lib/trpc"
import {
  matchesShortcut,
  shortcutKeys,
  shortcutNamed,
} from "@renderer/features/shortcuts/shortcuts"
import { CommandMenu, type Command } from "./command-menu"
import { LineHeader } from "./line-header"
import { lineCommands, wordAt, type LineMenuContext } from "./line-commands"
import { asLineInput, withChosenKind } from "./line-input"

/** The chord that opens the menu, read from the one list so rebinding it moves this too. */
const MENU_SHORTCUT = shortcutNamed("commandMenu")

/** What can be said about a spoken line beyond who says it and what it says. */
const FLAGS = [
  { key: "offScreen", label: "Off screen" },
  { key: "crossesCut", label: "Carries across the cut" },
  { key: "cutOff", label: "Cut off by the end" },
] as const

/**
 * Whoever an empty line of `kind` starts on. Only a spoken line has to have somebody: the rest
 * start on nobody and hold whatever is typed into them, which is how a shot says what is on
 * screen without first making a cast member of it.
 */
function startsOn(kind: LineInput["kind"], speakers: SubjectComposition[]): number[] {
  return kind === "speech" && speakers[0] ? [speakers[0].id] : []
}

/** An empty line of `kind`, ready to type into. */
function emptyLine(kind: LineInput["kind"], speakers: SubjectComposition[]): LineInput {
  return {
    kind,
    subjectIds: startsOn(kind, speakers),
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
  subjects: SubjectComposition[]
  speakers: SubjectComposition[]
  /** Whether the cursor belongs in this shot's first line, because the shot was just added. */
  startFocused: boolean
  menu: LineMenuContext
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
  startFocused,
  menu,
  onChange,
}: ShotLinesProps): React.JSX.Element {
  // What is being typed, until it is written and comes back, the same as the other fields of a shot.
  const [draft, setDraft] = useState<{ from: string; lines: LineInput[] } | null>(null)
  // Which line the command menu is open on, and the word the cursor was in when it opened.
  const [menuOn, setMenuOn] = useState<{ at: number; word: string } | null>(null)
  // Which line to put the cursor in, once the list holding it has been drawn. A ref rather than
  // state, so landing the cursor does not ask for another render of its own.
  const focusAt = useRef<number | null>(null)
  const boxes = useRef(new Map<number, HTMLTextAreaElement>())
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

  useEffect(() => {
    if (startFocused) boxes.current.get(0)?.focus()
  }, [startFocused])

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

  /**
   * Turns a line into another kind, landing it on somebody when its new kind needs one. The
   * cursor is left where the menu closes it, which is the line it was opened from.
   */
  const switchKind = (at: number, kind: LineKind): void => {
    write(at, withChosenKind(shown[at], kind, speakers))
  }

  /** Puts what the shot shows on a line of its own, after the line the menu was opened on. */
  const showSubject = (at: number, subjectId: number): void => {
    onChange([
      ...shown.slice(0, at + 1),
      { ...emptyLine("shows", speakers), subjectIds: [subjectId] },
      ...shown.slice(at + 1),
    ])
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
                onInsertAfter={() => insertAfter(index, "action")}
                menuOpen={menuOn?.at === index}
                onOpenMenu={(word) => setMenuOn({ at: index, word })}
                onCloseMenu={() => setMenuOn(null)}
                commands={lineCommands({
                  line,
                  word: menuOn?.at === index ? menuOn.word : "",
                  subjects,
                  speakers,
                  menu,
                  onSetKind: (kind) => switchKind(index, kind),
                  onShowSubject: (subjectId) => showSubject(index, subjectId),
                })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Nothing to add a line with when every one of them has been taken away. */}
      {shown.length === 0 && (
        <InsertRule label="Add a line" onInsert={() => insertAfter(-1, "action")} />
      )}

      {/* Beside the lines rather than inside one, where it would read as what was written. */}
      <div className="flex items-center gap-2 pl-5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Add a line at the end"
          onClick={() => insertAfter(shown.length - 1, "action")}
        >
          <Plus className="size-4" />
          Add a line
        </Button>
        <span className="text-xs text-muted-foreground">
          {shortcutKeys(MENU_SHORTCUT).join(" ")} for anything else
        </span>
      </div>
    </div>
  )
}

interface InsertRuleProps {
  label: string
  onInsert: () => void
}

/**
 * The gap under a line, which offers to put one there when the pointer is over it. Always the same
 * height whether it is showing or not, so the lines do not move under the mouse.
 */
function InsertRule({ label, onInsert }: InsertRuleProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title="Add a line here"
      className="group/rule flex h-3 w-full shrink-0 items-center"
      onClick={onInsert}
    >
      <span className="h-0.5 w-full rounded-full bg-transparent transition-colors group-hover/rule:bg-primary/60 group-focus-visible/rule:bg-primary/60" />
    </button>
  )
}

interface LineRowProps {
  shotId: number
  line: LineInput
  index: number
  subjects: SubjectComposition[]
  speakers: SubjectComposition[]
  boxRef: (box: HTMLTextAreaElement | null) => void
  onType: (line: LineInput) => void
  onCommit: () => void
  onWrite: (line: LineInput) => void
  onEnter: () => void
  onRemove: () => void
  onInsertAfter: () => void
  menuOpen: boolean
  onOpenMenu: (word: string) => void
  onCloseMenu: () => void
  commands: Command[]
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
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  commands,
}: LineRowProps): React.JSX.Element {
  const [showFlags, setShowFlags] = useState(false)
  // The menu hangs off the line rather than off a button, so nothing of its own holds the focus
  // to give back when it closes. This does.
  const box = useRef<HTMLTextAreaElement | null>(null)
  const wasOpen = useRef(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: index,
  })

  /*
   * The cursor goes back to the line the menu was opened from, whether it was dismissed or ran
   * something. It is put back here rather than in the popover's own close handler, which fires
   * while the box is detached between renders and so has nothing to put it in.
   */
  useEffect(() => {
    if (wasOpen.current && !menuOpen) box.current?.focus()
    wasOpen.current = menuOpen
  }, [menuOpen])

  const speaking = line.kind === "speech"

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex flex-col rounded ${isDragging ? "z-10 bg-accent" : ""}`}
    >
      {/* What the line is, above it rather than beside it, so the box below runs the full width. */}
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Reorder line ${index + 1}`}
          className="flex h-5 cursor-grab items-center text-muted-foreground opacity-40 group-focus-within:opacity-100 group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <LineHeader
          line={line}
          index={index}
          subjects={subjects}
          speakers={speakers}
          onWrite={onWrite}
        />

        <div className="flex-1" />

        {speaking && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5 shrink-0"
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
          className="size-5 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          aria-label={`Remove line ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Popover
        open={menuOpen}
        onOpenChange={(open) => {
          if (!open) onCloseMenu()
        }}
      >
        <PopoverAnchor asChild>
          {/* A box that wraps and grows rather than scrolling sideways, since a line can run
              long. Enter still makes the next line, so nothing types a newline into one. */}
          <Textarea
            ref={(element) => {
              box.current = element
              boxRef(element)
            }}
            rows={1}
            className="min-h-8 w-full resize-none py-1"
            aria-label={`Line ${index + 1} of shot ${shotId}`}
            value={line.text}
            onChange={(event) => onType({ ...line, text: event.target.value })}
            onBlur={onCommit}
            onKeyDown={(event) => {
              if (matchesShortcut(event, MENU_SHORTCUT)) {
                event.preventDefault()
                onOpenMenu(wordAt(line.text, event.currentTarget.selectionStart ?? 0))
                return
              }
              // A slash opens it too, but only where it cannot be mistaken for what was typed.
              if (event.key === "/" && line.text.length === 0) {
                event.preventDefault()
                onOpenMenu("")
                return
              }
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
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-80 p-1"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <CommandMenu commands={commands} onClose={onCloseMenu} />
        </PopoverContent>
      </Popover>

      {speaking && showFlags && (
        <div className="flex flex-wrap items-center gap-4 pt-2 pb-1 pl-5">
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

      <InsertRule label={`Add a line after line ${index + 1}`} onInsert={onInsertAfter} />
    </div>
  )
}
