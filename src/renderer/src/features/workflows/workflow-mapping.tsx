import { Chip } from "@renderer/features/clips/chip"
import type { SlotTier, WorkflowDetail, WorkflowSlot } from "@renderer/lib/trpc"
import { KIND_LABELS, TIERS } from "./slot-labels"

interface WorkflowMappingProps {
  slots: WorkflowSlot[]
  onSetTier: (slotId: number, tier: SlotTier) => void
}

/** A workflow's slots grouped by tier, each with the chips that move it to another. */
export function WorkflowMapping({ slots, onSetTier }: WorkflowMappingProps): React.JSX.Element {
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
                  <SlotRow key={slot.id} slot={slot} onSetTier={onSetTier} />
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
}

/** One slot: its name, what it takes, and where it is shown. */
function SlotRow({ slot, onSetTier }: SlotRowProps): React.JSX.Element {
  return (
    <li className="flex items-center gap-4 border-b py-1.5 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{slot.name}</span>
        <span className="text-xs text-muted-foreground">
          {KIND_LABELS[slot.kind]}
          {slot.bypassed ? " · bypassed in the workflow" : ""}
        </span>
      </span>
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
    </li>
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
