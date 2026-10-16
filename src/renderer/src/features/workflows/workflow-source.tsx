import { RefreshCw } from "lucide-react"
import { Button } from "@renderer/design-system"
import type { SlotDiff, SourceStatus } from "@renderer/lib/trpc"
import { KIND_LABELS } from "./slot-labels"

interface WorkflowSourceProps {
  status: SourceStatus | undefined
  isChecking: boolean
  isApplying: boolean
  onRefresh: () => void
  onApply: (contentHash: string) => void
}

/** How the source file stands against the project's copy, and its changes when it has some. */
export function WorkflowSource({
  status,
  isChecking,
  isApplying,
  onRefresh,
  onApply,
}: WorkflowSourceProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">{headline(status)}</p>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          disabled={isChecking}
          aria-label="Check the source file again"
          onClick={onRefresh}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      {status?.state === "unreadable" && (
        <p className="text-xs text-muted-foreground">{status.message}</p>
      )}
      {status?.state === "changed" && (
        <>
          <DiffLists diff={status.diff} />
          {status.boundConfigurationNames.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Configurations that bind a removed slot: {status.boundConfigurationNames.join(", ")}.
            </p>
          )}
          <div>
            <Button size="sm" disabled={isApplying} onClick={() => onApply(status.contentHash)}>
              Apply the changes
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/** One sentence on where the source stands. */
function headline(status: SourceStatus | undefined): string {
  if (!status) return "Checking the source file…"
  switch (status.state) {
    case "in-sync":
      return "In step with the source file."
    case "updated":
      return "Updated from the source file."
    case "missing":
      return "The source file is not there any more. The copy in this project still works."
    case "unreadable":
      return "The source file cannot be read just now. The copy in this project still works."
    case "changed":
      return "The source file has changed. Nothing here changes until the changes are applied."
  }
}

/** What the changes do to the slots, kind by kind, as they are rather than as a guess. */
function DiffLists({ diff }: { diff: SlotDiff }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {diff.renamed.length > 0 && (
        <DiffSection title="Renamed">
          {diff.renamed.map((slot) => (
            <li key={slot.slotId}>
              {slot.from} → {slot.to}
              <ShownAs displayName={slot.displayName} />
            </li>
          ))}
        </DiffSection>
      )}
      {diff.added.length > 0 && (
        <DiffSection title="Added">
          {diff.added.map((slot) => (
            <li key={slot.nodeId}>
              {slot.name} <span className="text-muted-foreground">· {KIND_LABELS[slot.kind]}</span>
            </li>
          ))}
        </DiffSection>
      )}
      {diff.removed.length > 0 && (
        <DiffSection title="Removed">
          {diff.removed.map((slot) => (
            <li key={slot.id}>
              {slot.name}
              <ShownAs displayName={slot.displayName} />
            </li>
          ))}
        </DiffSection>
      )}
      <p className="text-xs text-muted-foreground">
        {diff.kept.length} {diff.kept.length === 1 ? "slot is" : "slots are"} kept as they are.
        Renamed and kept slots keep their tiers, display names and notes.
      </p>
    </div>
  )
}

/** The name the form shows for a slot in the diff, when it has one. */
function ShownAs({ displayName }: { displayName: string | null }): React.JSX.Element | null {
  if (displayName === null) return null
  return <span className="text-muted-foreground"> · shown as {displayName}</span>
}

function DiffSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  )
}
