import { Button } from "@renderer/design-system"
import type { OutputExport, VerdictCounts, VerdictFilter } from "@renderer/lib/trpc"

/** Each filter's chip, in the order they are offered. */
const FILTER_CHIPS: { filter: VerdictFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "good", label: "Good" },
  { filter: "bad", label: "Bad" },
  { filter: "unmarked", label: "Unmarked" },
]

interface ReviewBarProps {
  counts: VerdictCounts
  filter: VerdictFilter
  onFilter: (filter: VerdictFilter) => void
  isExporting: boolean
  /** What the last export did, or nothing before the first. */
  lastExport: OutputExport | null
  onExport: () => void
  onOpenExportFolder: (folder: string) => void
}

/** Chips that pick which outputs the run list shows, and the export of the good ones. */
export function ReviewBar({
  counts,
  filter,
  onFilter,
  isExporting,
  lastExport,
  onExport,
  onOpenExportFolder,
}: ReviewBarProps): React.JSX.Element {
  const message = lastExport === null ? null : exportMessage(lastExport)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show outputs">
          {FILTER_CHIPS.map((chip) => (
            <Button
              key={chip.filter}
              variant={chip.filter === filter ? "secondary" : "outline"}
              size="sm"
              aria-pressed={chip.filter === filter}
              aria-label={`${chip.label} ${counts[chip.filter]}`}
              onClick={() => onFilter(chip.filter)}
            >
              {chip.label}
              <span className="text-xs text-muted-foreground">{counts[chip.filter]}</span>
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          aria-label={`Export good outputs ${counts.good}`}
          disabled={counts.good === 0 || isExporting}
          onClick={onExport}
        >
          Export good outputs
          <span className="text-xs text-muted-foreground">{counts.good}</span>
        </Button>
      </div>
      {message && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="break-all">{message}</span>
          {lastExport?.state === "written" && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => onOpenExportFolder(lastExport.folder)}
            >
              Open folder
            </Button>
          )}
        </p>
      )}
    </div>
  )
}

/** What to say about an export, or nothing when the folder pick was cancelled. */
function exportMessage(result: OutputExport): string | null {
  if (result.state === "cancelled") return null
  if (result.state === "nothing") return "No outputs are marked good, so nothing was written."
  const files = result.paths.length === 1 ? "1 file" : `${result.paths.length} files`
  return `Wrote ${files} to ${result.folder}.`
}
