import { Pencil } from "lucide-react"
import { useId, useState } from "react"
import { Button, Input, Label } from "@renderer/design-system"
import { Chip } from "@renderer/features/clips/chip"
import type { SlotTier, WorkflowDetail, WorkflowSlot } from "@renderer/lib/trpc"
import { KIND_LABELS, TIERS } from "./slot-labels"

/** What the form shows for a slot: a name in place of the scanned one, empty for none, and a note. */
export interface SlotLabel {
  displayName: string
  note: string
}

interface WorkflowMappingProps {
  slots: WorkflowSlot[]
  onSetTier: (slotId: number, tier: SlotTier) => void
  onSetLabel: (slotId: number, label: SlotLabel) => void
}

/**
 * A workflow's slots grouped by tier, each with the chips that move it to another and an edit for
 * the name and note the form shows.
 */
export function WorkflowMapping({
  slots,
  onSetTier,
  onSetLabel,
}: WorkflowMappingProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {TIERS.map(({ tier, label }) => {
        const inTier = slots.filter((slot) => slot.tier === tier)
        return (
          <section key={tier} aria-label={label} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {label}
            </h3>
            {inTier.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here.</p>
            ) : (
              <ul className="flex flex-col">
                {inTier.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    onSetTier={onSetTier}
                    onSetLabel={onSetLabel}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

interface SlotRowProps {
  slot: WorkflowSlot
  onSetTier: (slotId: number, tier: SlotTier) => void
  onSetLabel: (slotId: number, label: SlotLabel) => void
}

/** One slot: its scanned name, what it takes, how the form shows it, and where it is shown. */
function SlotRow({ slot, onSetTier, onSetLabel }: SlotRowProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  return (
    <li className="flex flex-col gap-2 border-b py-1.5 last:border-b-0">
      <div className="flex items-center gap-4">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{slot.name}</span>
          <span className="text-xs text-muted-foreground">
            {KIND_LABELS[slot.kind]}
            {slot.startsOff ? " · off in the workflow" : ""}
            {slot.displayName === null ? "" : ` · shown as ${slot.displayName}`}
          </span>
          {slot.note !== "" && (
            <span className="truncate text-xs text-muted-foreground">{slot.note}</span>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label={`Edit ${slot.name}`}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <TierChips slot={slot} onSetTier={onSetTier} />
      </div>
      {editing && (
        <LabelForm
          slot={slot}
          onSave={(label) => {
            onSetLabel(slot.id, label)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </li>
  )
}

/** The chips that move a slot to another tier, the one it is at marked. */
function TierChips({
  slot,
  onSetTier,
}: {
  slot: WorkflowSlot
  onSetTier: (slotId: number, tier: SlotTier) => void
}): React.JSX.Element {
  return (
    <span className="flex shrink-0 gap-1">
      {TIERS.map(({ tier, label }) => (
        <Chip
          key={tier}
          chosen={slot.tier === tier}
          label={`${label}: ${slot.name}`}
          onToggle={() => {
            if (slot.tier !== tier) onSetTier(slot.id, tier)
          }}
        >
          {label}
        </Chip>
      ))}
    </span>
  )
}

/** The display name and note of a slot as inputs, saved together and left alone on Escape. */
function LabelForm({
  slot,
  onSave,
  onCancel,
}: {
  slot: WorkflowSlot
  onSave: (label: SlotLabel) => void
  onCancel: () => void
}): React.JSX.Element {
  const id = useId()
  const [displayName, setDisplayName] = useState(slot.displayName ?? "")
  const [note, setNote] = useState(slot.note)
  return (
    <form
      aria-label={`Label for ${slot.name}`}
      className="flex flex-wrap items-end gap-3 pb-1"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ displayName, note })
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel()
      }}
    >
      <span className="flex min-w-40 flex-1 flex-col gap-1">
        <Label htmlFor={`${id}-name`} className="text-xs text-muted-foreground">
          Shown as
        </Label>
        <Input
          id={`${id}-name`}
          className="h-8"
          placeholder={slot.name}
          value={displayName}
          autoFocus
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </span>
      <span className="flex min-w-40 flex-[2] flex-col gap-1">
        <Label htmlFor={`${id}-note`} className="text-xs text-muted-foreground">
          Note
        </Label>
        <Input
          id={`${id}-note`}
          className="h-8"
          placeholder="One line under the slot in the form"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </span>
      <span className="flex gap-1">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </span>
    </form>
  )
}

interface WorkflowGuideProps {
  guide: WorkflowDetail["guide"]
}

/** The workflow's own notes, in the order the graph lists them. */
export function WorkflowGuide({ guide }: WorkflowGuideProps): React.JSX.Element {
  if (guide.length === 0) {
    return <p className="text-sm text-muted-foreground">The workflow has no notes.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {guide.map((note) => (
        <section key={note.nodeId} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {note.title ?? "Note"}
          </h3>
          <p className="text-sm whitespace-pre-wrap">{note.text}</p>
        </section>
      ))}
    </div>
  )
}
