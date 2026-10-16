import { ChevronRight, Dices } from "lucide-react"
import { useState } from "react"
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
import { LibraryImagePicker } from "@renderer/features/library/library-image-picker"
import type { LibraryFolder, RunBinding, SavedSlotValue, WorkflowSlot } from "@renderer/lib/trpc"
import { KIND_LABELS } from "./slot-labels"

/** The kinds of slot filled from a file on disk. */
export type FileKind = "image" | "audio"

/** What the form holds for one slot, by what the slot takes. */
type Field =
  | { type: "typed"; text: string }
  | { type: "switch"; checked: boolean }
  | { type: "file"; saved: string | null; path: string | null }
  | { type: "as-saved" }

/** The fields whose control the slot's label names. */
const LABELLED_FIELDS: ReadonlySet<Field["type"]> = new Set(["typed", "switch"])

/** One slot in the form: whether its node runs, and what fills it. */
interface SlotState {
  on: boolean
  field: Field
}

interface RunFormProps {
  slots: WorkflowSlot[]
  savedValues: SavedSlotValue[]
  blockedReason: string | null
  isQueueing: boolean
  onQueue: (bindings: RunBinding[]) => void
  onPickFile: (kind: FileKind) => Promise<string | null>
  /** The library folder, whose pictures an image slot can be filled from. */
  library: LibraryFolder | undefined
}

/**
 * A workflow's slots as a form, starting from the values saved in the graph, so queueing it
 * unchanged runs the workflow as saved. Basic slots show, advanced ones sit behind a fold.
 */
export function RunForm({
  slots,
  savedValues,
  blockedReason,
  isQueueing,
  onQueue,
  onPickFile,
  library,
}: RunFormProps): React.JSX.Element {
  const [states, setStates] = useState<Record<number, SlotState>>(() =>
    Object.fromEntries(slots.map((slot) => [slot.id, initialState(slot, savedValues)]))
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const setState = (slotId: number, state: SlotState): void =>
    setStates((current) => ({ ...current, [slotId]: state }))

  const bindings = slots.map((slot) => bindingOf(slot, states[slot.id]))
  const problem = bindings.find((entry) => "problem" in entry)
  const reason = blockedReason ?? (problem && "problem" in problem ? problem.problem : null)
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
          library={library}
        />
      ))}
    </ul>
  )

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex items-center gap-3">
        <Button
          disabled={reason !== null || isQueueing}
          onClick={() =>
            onQueue(bindings.flatMap((entry) => ("binding" in entry ? [entry.binding] : [])))
          }
        >
          {isQueueing ? "Queueing…" : "Queue"}
        </Button>
        {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
      </div>
    </div>
  )
}

interface SlotFieldProps {
  slot: WorkflowSlot
  state: SlotState
  onChange: (state: SlotState) => void
  onPickFile: (kind: FileKind) => Promise<string | null>
  library: LibraryFolder | undefined
}

/** One slot: its name, a switch when it is off in the workflow, and the control for its value. */
function SlotField({
  slot,
  state,
  onChange,
  onPickFile,
  library,
}: SlotFieldProps): React.JSX.Element {
  const id = `slot-${slot.id}`
  // A slot bypassed in the workflow, or one that only switches a node, can be turned on and off.
  const switchable = slot.bypassed || slot.kind === "toggle"
  const setField = (field: Field): void => onChange({ ...state, field })

  return (
    <li className="flex flex-col gap-1.5 border-b py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        {/* A file slot's button names itself, so the label points at nothing then. */}
        <Label htmlFor={LABELLED_FIELDS.has(state.field.type) ? id : undefined} className="min-w-0">
          <span className="truncate">{slot.name}</span>
        </Label>
        <span className="text-xs text-muted-foreground">{KIND_LABELS[slot.kind]}</span>
        {switchable && (
          <Switch
            className="ml-auto"
            aria-label={`Use ${slot.name}`}
            checked={state.on}
            onCheckedChange={(on) => onChange({ ...state, on })}
          />
        )}
      </div>
      <FieldControl
        id={id}
        slot={slot}
        field={state.field}
        disabled={!state.on}
        onChange={setField}
        onPickFile={onPickFile}
        library={library}
      />
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
  library: LibraryFolder | undefined
}

/** The control a slot's value is set with, by what the slot takes. */
function FieldControl({
  id,
  slot,
  field,
  disabled,
  onChange,
  onPickFile,
  library,
}: FieldControlProps): React.JSX.Element | null {
  const [pickingFromLibrary, setPickingFromLibrary] = useState(false)

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
          aria-label={`Choose file for ${slot.name}`}
          onClick={async () => {
            const path = await onPickFile(kind)
            if (path) onChange({ ...field, path })
          }}
        >
          Choose file
        </Button>
        {kind === "image" && (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`Choose ${slot.name} from the library`}
            onClick={() => setPickingFromLibrary(true)}
          >
            From library
          </Button>
        )}
        <span className="truncate text-sm">
          {field.path ? fileName(field.path) : (field.saved ?? "Nothing chosen")}
        </span>
        {field.path === null && field.saved !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">as saved</span>
        )}
        {pickingFromLibrary && (
          <LibraryImagePicker
            folder={library}
            onPick={(file) => {
              onChange({ ...field, path: file.path })
              setPickingFromLibrary(false)
            }}
            onCancel={() => setPickingFromLibrary(false)}
          />
        )}
      </div>
    )
  }
  if (slot.kind === "text") {
    return (
      <Textarea
        id={id}
        className="min-h-40"
        disabled={disabled}
        value={field.text}
        onChange={(event) => onChange({ type: "typed", text: event.target.value })}
      />
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

/** Where a slot starts: on unless the workflow has it bypassed, holding the value it was saved with. */
function initialState(slot: WorkflowSlot, savedValues: SavedSlotValue[]): SlotState {
  const saved = savedValues.find((entry) => entry.slotId === slot.id)?.value ?? null
  return { on: !slot.bypassed, field: initialField(slot, saved) }
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
      return { type: "file", saved: typeof saved === "string" ? saved : null, path: null }
    case "lora":
    case "toggle":
      return { type: "as-saved" }
  }
}

/** The binding a slot sends, or what stops it being sent. */
function bindingOf(
  slot: WorkflowSlot,
  state: SlotState
): { binding: RunBinding } | { problem: string } {
  const send = (value: RunBinding["value"]): { binding: RunBinding } => ({
    binding: { slotId: slot.id, on: state.on, value },
  })
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
      if (slot.kind === "text") return send({ type: "value", value: field.text })
      const number = readNumber(slot.kind, field.text)
      return number === null
        ? { problem: `${slot.name} needs ${NUMBER_NEEDS[slot.kind] ?? "a number"}.` }
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

/** A seed JavaScript can hold exactly, which is all but the top bits ComfyUI's seeds allow. */
function randomSeed(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
}

/** The last part of a path, whichever separator it uses. */
function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
