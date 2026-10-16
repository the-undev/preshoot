import { ChevronRight, Dices } from "lucide-react"
import { useEffect, useState } from "react"
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Switch,
  Textarea,
} from "@renderer/design-system"
import { LibraryFilePicker } from "@renderer/features/library/library-file-picker"
import { fileName } from "@renderer/lib/file-name"
import {
  libraryFileUrl,
  type LibraryFile,
  type RunBinding,
  type SavedSlotValue,
  type WorkflowSlot,
} from "@renderer/lib/trpc"
import { SaveConfigurationDialog } from "./save-configuration-dialog"
import { BATCH_LIMIT, randomSeed } from "../../../../main/core/dispatch/batch"
import { KIND_LABELS, shownName } from "./slot-labels"

/** The kinds of slot filled from a file on disk. */
export type FileKind = "image" | "audio"

/** The extensions each kind of file slot takes, as the library's media table reads them. */
const EXTENSIONS_BY_KIND: Record<FileKind, ReadonlySet<string>> = {
  image: new Set(["png", "jpg", "jpeg", "webp", "gif"]),
  audio: new Set(["wav", "mp3", "flac", "ogg"]),
}

/** What a slot says when a file of another kind is dropped on it. */
const WRONG_KIND_MESSAGES: Record<FileKind, string> = {
  image: "That is not an image file.",
  audio: "That is not an audio file.",
}

/**
 * What the form holds for one slot, by what the slot takes. A file picked from the library also
 * holds its path in the library, which its thumbnail is read by.
 */
type Field =
  | { type: "typed"; text: string }
  | { type: "switch"; checked: boolean }
  | { type: "file"; saved: string | null; path: string | null; libraryPath: string | null }
  | { type: "as-saved" }

/** The fields whose control the slot's label names. */
const LABELLED_FIELDS: ReadonlySet<Field["type"]> = new Set(["typed", "switch"])

/** One slot in the form: whether its node runs, and what fills it. */
interface SlotState {
  on: boolean
  field: Field
}

/** The form's slots as they stand, with the saved values the form started from. */
export interface FormFields {
  savedValues: SavedSlotValue[]
  states: Record<number, SlotState>
}

interface RunFormProps {
  slots: WorkflowSlot[]
  savedValues: SavedSlotValue[]
  /** Values a loaded configuration gives some slots, which they start from instead. */
  initialBindings: RunBinding[]
  /** The fields the last form held, kept by each slot whose saved value is the same. */
  keptFields: FormFields | null
  /** Hands the form's fields up each time they change, for the next form to keep. */
  onFieldsChange: (fields: FormFields) => void
  /** The name of the configuration loaded into the form, which saving can update. */
  configurationName: string | null
  /** Whether the form was started from a configuration or a clip rather than the workflow. */
  hasStart: boolean
  /** Starts the form again from the values saved in the workflow, dropping its start and edits. */
  onStartFromWorkflow: () => void
  blockedReason: string | null
  isQueueing: boolean
  onQueue: (bindings: RunBinding[], count: number) => void
  onSaveNew: (name: string, bindings: RunBinding[]) => Promise<void>
  onUpdate: (bindings: RunBinding[]) => Promise<void>
  onPickFile: (kind: FileKind) => Promise<string | null>
  /** Reads a library text file, which fills a text slot picked from the library. */
  onReadText: (file: LibraryFile) => Promise<string>
}

/**
 * A workflow's slots as a form, starting from the values saved in the graph, so queueing it
 * unchanged runs the workflow as saved. Basic slots show, advanced ones sit behind a fold.
 */
export function RunForm({
  slots,
  savedValues,
  initialBindings,
  keptFields,
  onFieldsChange,
  configurationName,
  hasStart,
  onStartFromWorkflow,
  blockedReason,
  isQueueing,
  onQueue,
  onSaveNew,
  onUpdate,
  onPickFile,
  onReadText,
}: RunFormProps): React.JSX.Element {
  const [states, setStates] = useState<Record<number, SlotState>>(() =>
    startingStates(slots, savedValues, initialBindings, keptFields)
  )
  useEffect(() => onFieldsChange({ savedValues, states }), [onFieldsChange, savedValues, states])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [countText, setCountText] = useState("1")
  const [saving, setSaving] = useState(false)
  const setState = (slotId: number, state: SlotState): void =>
    setStates((current) => ({ ...current, [slotId]: state }))

  const bindings = slots.map((slot) => bindingOf(slot, states[slot.id]))
  const problem = bindings.find((entry) => "problem" in entry)
  const bindingProblem = problem && "problem" in problem ? problem.problem : null
  const count = readCount(countText)
  const countProblem =
    count === null ? `The number of runs is a whole number from 1 to ${BATCH_LIMIT}.` : null
  const reason = blockedReason ?? bindingProblem ?? countProblem
  const sent = (): RunBinding[] =>
    bindings.flatMap((entry) => ("binding" in entry ? [entry.binding] : []))
  // Built the same way as the states, so a form holding the workflow's values reads as unedited.
  const edited =
    JSON.stringify(states) !== JSON.stringify(startingStates(slots, savedValues, [], null))
  const basic = slots.filter((slot) => slot.tier === "basic")
  const advanced = slots.filter((slot) => slot.tier === "advanced")

  const rows = (inTier: WorkflowSlot[]): React.JSX.Element => (
    <ul className="flex flex-col">
      {inTier.map((slot) => (
        <SlotField
          key={slot.id}
          slot={slot}
          state={states[slot.id]}
          onChange={(state) => setState(slot.id, state)}
          onPickFile={onPickFile}
          onReadText={onReadText}
        />
      ))}
    </ul>
  )

  return (
    // A file dropped anywhere a slot does not take it would otherwise open in the window.
    <div
      className="flex flex-col gap-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      {basic.length > 0 ? (
        rows(basic)
      ) : (
        <p className="text-sm text-muted-foreground">No slots are shown up front.</p>
      )}

      {advanced.length > 0 && (
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
              <ChevronRight
                className={advancedOpen ? "size-4 rotate-90 transition-transform" : "size-4"}
              />
              Advanced ({advanced.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>{rows(advanced)}</CollapsibleContent>
        </Collapsible>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={reason !== null || isQueueing}
          onClick={() => count !== null && onQueue(sent(), count)}
        >
          {isQueueing ? "Queueing…" : "Queue"}
        </Button>
        <Label className="gap-1.5 text-sm font-normal text-muted-foreground">
          <span aria-hidden>×</span>
          <Input
            aria-label="Number of runs"
            className="h-8 w-14"
            inputMode="numeric"
            value={countText}
            onChange={(event) => setCountText(event.target.value)}
          />
        </Label>
        <Button
          variant="outline"
          disabled={bindingProblem !== null}
          onClick={() => setSaving(true)}
        >
          Save as configuration
        </Button>
        {(hasStart || edited) && (
          <Button variant="outline" onClick={onStartFromWorkflow}>
            Start from the workflow
          </Button>
        )}
        {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
      </div>

      {saving && (
        <SaveConfigurationDialog
          configurationName={configurationName}
          onSaveNew={async (name) => {
            await onSaveNew(name, sent())
            setSaving(false)
          }}
          onUpdate={async () => {
            await onUpdate(sent())
            setSaving(false)
          }}
          onCancel={() => setSaving(false)}
        />
      )}
    </div>
  )
}

/** A path's extension in lower case without its dot, or nothing when it has none. */
function extensionOf(path: string): string {
  const name = fileName(path).toLowerCase()
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot + 1)
}

/** The number of runs typed beside Queue, or nothing when it is not one a batch takes. */
function readCount(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const count = Number(trimmed)
  return count >= 1 && count <= BATCH_LIMIT ? count : null
}

interface SlotFieldProps {
  slot: WorkflowSlot
  state: SlotState
  onChange: (state: SlotState) => void
  onPickFile: (kind: FileKind) => Promise<string | null>
  onReadText: (file: LibraryFile) => Promise<string>
}

/** One slot: its shown name and note, a switch when it is off, and the control for its value. */
function SlotField({
  slot,
  state,
  onChange,
  onPickFile,
  onReadText,
}: SlotFieldProps): React.JSX.Element {
  const id = `slot-${slot.id}`
  // A slot that starts off, or one that only switches a node, can be turned on and off.
  const switchable = slot.startsOff || slot.kind === "toggle"
  const [dropProblem, setDropProblem] = useState<string | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const setField = (field: Field): void => {
    setDropProblem(null)
    onChange({ ...state, field })
  }
  const field = state.field

  function dropFile(event: React.DragEvent<HTMLLIElement>): void {
    event.preventDefault()
    setIsDraggingFile(false)
    const dropped = event.dataTransfer.files[0]
    if (!dropped || field.type !== "file") return
    const path = window.preshoot.getPathForFile(dropped)
    const kind = slot.kind as FileKind
    if (!EXTENSIONS_BY_KIND[kind].has(extensionOf(path))) {
      setDropProblem(WRONG_KIND_MESSAGES[kind])
      return
    }
    setField({ ...field, path, libraryPath: null })
  }

  const dropHandlers =
    field.type === "file" && state.on
      ? {
          onDragOver: (event: React.DragEvent<HTMLLIElement>) => {
            if (!event.dataTransfer.types.includes("Files")) return
            event.preventDefault()
            setIsDraggingFile(true)
          },
          onDragLeave: (event: React.DragEvent<HTMLLIElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsDraggingFile(false)
            }
          },
          onDrop: dropFile,
        }
      : {}

  return (
    <li
      className={
        isDraggingFile
          ? "flex flex-col gap-1.5 rounded-md border-b bg-accent/50 py-2 ring-2 ring-ring last:border-b-0"
          : "flex flex-col gap-1.5 border-b py-2 last:border-b-0"
      }
      {...dropHandlers}
    >
      <div className="flex items-center gap-3">
        {/* A file slot's button names itself, so the label points at nothing then. */}
        <Label htmlFor={LABELLED_FIELDS.has(state.field.type) ? id : undefined} className="min-w-0">
          <span className="truncate">{shownName(slot)}</span>
        </Label>
        <span className="text-xs text-muted-foreground">{KIND_LABELS[slot.kind]}</span>
        {switchable && (
          <Switch
            className="ml-auto"
            aria-label={`Use ${shownName(slot)}`}
            checked={state.on}
            onCheckedChange={(on) => onChange({ ...state, on })}
          />
        )}
      </div>
      {slot.note !== "" && <p className="text-xs text-muted-foreground">{slot.note}</p>}
      <FieldControl
        id={id}
        slot={slot}
        field={state.field}
        disabled={!state.on}
        onChange={setField}
        onPickFile={onPickFile}
        onReadText={onReadText}
      />
      {dropProblem && <p className="text-sm text-destructive">{dropProblem}</p>}
    </li>
  )
}

interface FieldControlProps {
  id: string
  slot: WorkflowSlot
  field: Field
  disabled: boolean
  onChange: (field: Field) => void
  onPickFile: (kind: FileKind) => Promise<string | null>
  onReadText: (file: LibraryFile) => Promise<string>
}

/** The control a slot's value is set with, by what the slot takes. */
function FieldControl({
  id,
  slot,
  field,
  disabled,
  onChange,
  onPickFile,
  onReadText,
}: FieldControlProps): React.JSX.Element | null {
  const [pickingFromLibrary, setPickingFromLibrary] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)

  if (field.type === "as-saved") {
    return slot.kind === "lora" ? (
      <p className="text-sm text-muted-foreground">As saved in the workflow.</p>
    ) : null
  }
  if (field.type === "switch") {
    return (
      <Switch
        id={id}
        checked={field.checked}
        disabled={disabled}
        onCheckedChange={(checked) => onChange({ type: "switch", checked })}
      />
    )
  }
  if (field.type === "file") {
    const kind = slot.kind as FileKind
    return (
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Choose file for ${shownName(slot)}`}
          onClick={async () => {
            const path = await onPickFile(kind)
            if (path) onChange({ ...field, path, libraryPath: null })
          }}
        >
          Choose file
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Choose ${shownName(slot)} from the library`}
          onClick={() => setPickingFromLibrary(true)}
        >
          From library
        </Button>
        {kind === "image" && field.libraryPath !== null && (
          <img
            src={libraryFileUrl(field.libraryPath, 80)}
            alt=""
            className="size-12 shrink-0 rounded object-cover"
          />
        )}
        <span className="truncate text-sm">
          {field.path ? fileName(field.path) : (field.saved ?? "Nothing chosen")}
        </span>
        {field.path === null && field.saved !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">as saved</span>
        )}
        {pickingFromLibrary && (
          <LibraryFilePicker
            media={kind}
            onPick={(file) => {
              onChange({ ...field, path: file.path, libraryPath: file.relativePath })
              setPickingFromLibrary(false)
            }}
            onCancel={() => setPickingFromLibrary(false)}
          />
        )}
      </div>
    )
  }
  if (slot.kind === "text") {
    const typed = (text: string): void => onChange({ type: "typed", text })
    const fillFrom = async (file: LibraryFile): Promise<void> => {
      setPickingFromLibrary(false)
      try {
        typed(await onReadText(file))
        setReadError(null)
      } catch (error) {
        setReadError(error instanceof Error ? error.message : `${file.name} could not be read.`)
      }
    }
    return (
      <div className="flex flex-col items-start gap-1.5">
        {slot.multiline ? (
          <Textarea
            id={id}
            className="min-h-40"
            disabled={disabled}
            value={field.text}
            onChange={(event) => typed(event.target.value)}
          />
        ) : (
          <Input
            id={id}
            disabled={disabled}
            value={field.text}
            onChange={(event) => typed(event.target.value)}
          />
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Fill ${shownName(slot)} from the library`}
          onClick={() => setPickingFromLibrary(true)}
        >
          From library
        </Button>
        {readError && <p className="text-sm text-destructive">{readError}</p>}
        {pickingFromLibrary && (
          <LibraryFilePicker
            media="text"
            readText={onReadText}
            onPick={(file) => void fillFrom(file)}
            onCancel={() => setPickingFromLibrary(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        className="max-w-64"
        inputMode={slot.kind === "number" ? "decimal" : "numeric"}
        disabled={disabled}
        value={field.text}
        onChange={(event) => onChange({ type: "typed", text: event.target.value })}
      />
      {slot.kind === "seed" && (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange({ type: "typed", text: String(randomSeed()) })}
        >
          <Dices className="size-4" />
          Randomise
        </Button>
      )}
    </div>
  )
}

/**
 * Where each slot starts: as the form kept it when its saved value is the same as when it was
 * kept, as the workflow now saves it when that value changed, or else from the bindings and the
 * saved values.
 */
function startingStates(
  slots: WorkflowSlot[],
  savedValues: SavedSlotValue[],
  initialBindings: RunBinding[],
  kept: FormFields | null
): Record<number, SlotState> {
  return Object.fromEntries(
    slots.map((slot) => {
      const fresh = initialState(slot, savedValues, initialBindings)
      const before = kept?.states[slot.id]
      // A slot that now takes another kind of value cannot keep what it held.
      if (!kept || !before || before.field.type !== fresh.field.type) return [slot.id, fresh]
      const savedBefore = savedValueOf(kept.savedValues, slot.id)
      if (savedBefore !== savedValueOf(savedValues, slot.id)) {
        return [slot.id, initialState(slot, savedValues, [])]
      }
      return [slot.id, before]
    })
  )
}

function savedValueOf(savedValues: SavedSlotValue[], slotId: number): SavedSlotValue["value"] {
  return savedValues.find((entry) => entry.slotId === slotId)?.value ?? null
}

/**
 * Where a slot starts: as a loaded configuration binds it, or else on unless the workflow has it
 * switched off, and holding the value it was saved with.
 */
function initialState(
  slot: WorkflowSlot,
  savedValues: SavedSlotValue[],
  initialBindings: RunBinding[]
): SlotState {
  const saved = savedValueOf(savedValues, slot.id)
  const binding = initialBindings.find((entry) => entry.slotId === slot.id)
  if (!binding) return { on: !slot.startsOff, field: initialField(slot, saved) }
  return { on: binding.on, field: boundField(slot, saved, binding.value) }
}

/** The field a bound value fills, keeping what the workflow saved for a file slot's fallback. */
function boundField(
  slot: WorkflowSlot,
  saved: SavedSlotValue["value"],
  value: RunBinding["value"]
): Field {
  if (value === null) return initialField(slot, saved)
  if (value.type === "value") return initialField(slot, value.value)
  return {
    type: "file",
    saved: typeof saved === "string" ? saved : null,
    path: value.path,
    libraryPath: null,
  }
}

function initialField(slot: WorkflowSlot, saved: SavedSlotValue["value"]): Field {
  switch (slot.kind) {
    case "text":
    case "integer":
    case "number":
    case "seed":
      return { type: "typed", text: saved === null ? "" : String(saved) }
    case "boolean":
      return { type: "switch", checked: saved === true }
    case "image":
    case "audio":
      return {
        type: "file",
        saved: typeof saved === "string" ? saved : null,
        path: null,
        libraryPath: null,
      }
    case "lora":
    case "toggle":
      return { type: "as-saved" }
  }
}

/**
 * The binding a slot sends, or what stops it being sent. Only a slot that is shown and on is
 * checked: a hidden slot runs as saved, and one switched off keeps its text for when it is on.
 */
function bindingOf(
  slot: WorkflowSlot,
  state: SlotState
): { binding: RunBinding } | { problem: string } {
  const send = (value: RunBinding["value"]): { binding: RunBinding } => ({
    binding: { slotId: slot.id, on: state.on, value },
  })
  if (slot.tier === "hidden") return send(null)
  const field = state.field
  switch (field.type) {
    case "as-saved":
      return send(null)
    case "switch":
      return send({ type: "value", value: field.checked })
    case "file":
      if (field.path) return send({ type: "file", path: field.path })
      return send(field.saved === null ? null : { type: "value", value: field.saved })
    case "typed": {
      if (!state.on) return send(null)
      if (slot.kind === "text") return send({ type: "value", value: field.text })
      const number = readNumber(slot.kind, field.text)
      return number === null
        ? { problem: `${shownName(slot)} needs ${NUMBER_NEEDS[slot.kind] ?? "a number"}.` }
        : send({ type: "value", value: number })
    }
  }
}

/** What each numeric kind of slot takes, in words, for when it holds something else. */
const NUMBER_NEEDS: Partial<Record<WorkflowSlot["kind"], string>> = {
  integer: "a whole number",
  number: "a number",
  seed: "a whole number of zero or more",
}

/** The number typed into a slot, or nothing when it is not one the slot takes. */
function readNumber(kind: WorkflowSlot["kind"], text: string): number | null {
  const trimmed = text.trim()
  if (kind === "number") {
    const value = Number(trimmed)
    return trimmed.length > 0 && Number.isFinite(value) ? value : null
  }
  const pattern = kind === "seed" ? /^\d+$/ : /^-?\d+$/
  return pattern.test(trimmed) ? Number(trimmed) : null
}
