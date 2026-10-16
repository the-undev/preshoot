import { Button } from "@renderer/design-system"
import type { RunOutput, RunRecord, RunState, Verdict, VerdictFilter } from "@renderer/lib/trpc"
import { RunOutputItem } from "./run-output"

/** What each state is called, and the colour its chip takes. */
const STATE_CHIPS: Record<RunState, { label: string; className: string }> = {
  queued: { label: "Queued", className: "border-input text-muted-foreground" },
  running: { label: "Running", className: "border-chosen text-foreground" },
  failed: { label: "Failed", className: "border-destructive text-destructive" },
  done: { label: "Done", className: "border-input bg-muted text-foreground" },
}

/** The states of a run ComfyUI has not finished with. */
const UNFINISHED_STATES: ReadonlySet<RunState> = new Set(["queued", "running"])

interface RunListProps {
  runs: RunRecord[]
  positions: Record<number, number | null>
  pollError: string | null
  cancelError: string | null
  /** The runs a cancel has been asked for and not yet answered, whose button waits. */
  cancellingRunIds: ReadonlySet<number>
  /**
   * Which outputs show. A finished run with none of them is left out, unless every output shows.
   */
  filter: VerdictFilter
  onOpenOutput: (outputId: number) => void
  onSetVerdict: (outputId: number, verdict: Verdict | null) => void
  onSetNote: (outputId: number, note: string) => void
  onCancel: (runId: number) => void
}

/** A workflow's runs, newest first, each as one slim row with its outputs. */
export function RunList({
  runs,
  positions,
  pollError,
  cancelError,
  cancellingRunIds,
  filter,
  onOpenOutput,
  onSetVerdict,
  onSetNote,
  onCancel,
}: RunListProps): React.JSX.Element {
  const shown = filter === "all" ? runs : runs.flatMap((run) => withOutputsKept(run, filter))
  return (
    <div className="flex flex-col gap-2">
      {pollError && (
        <p className="text-sm text-destructive">
          Could not ask ComfyUI how runs stand: {pollError}
        </p>
      )}
      {cancelError && <p className="text-sm break-words text-destructive">{cancelError}</p>}
      {runs.length === 0 && <p className="text-sm text-muted-foreground">Nothing queued yet.</p>}
      {runs.length > 0 && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">No outputs match.</p>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              position={positions[run.id] ?? null}
              isCancelling={cancellingRunIds.has(run.id)}
              onOpenOutput={onOpenOutput}
              onSetVerdict={onSetVerdict}
              onSetNote={onSetNote}
              onCancel={() => onCancel(run.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface RunRowProps {
  run: RunRecord
  position: number | null
  isCancelling: boolean
  onOpenOutput: (outputId: number) => void
  onSetVerdict: (outputId: number, verdict: Verdict | null) => void
  onSetNote: (outputId: number, note: string) => void
  onCancel: () => void
}

/**
 * One run: its state, its seed, when it was queued, the configuration it came from, a way to
 * cancel it while unfinished, and its error or its files.
 */
function RunRow({
  run,
  position,
  isCancelling,
  onOpenOutput,
  onSetVerdict,
  onSetNote,
  onCancel,
}: RunRowProps): React.JSX.Element {
  const chip = STATE_CHIPS[run.state]
  const label =
    run.state === "queued" && position !== null ? `${chip.label}, position ${position}` : chip.label
  return (
    <li
      aria-label={`Run ${run.id}`}
      className="flex flex-col gap-1 border-b py-1.5 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${chip.className}`}>
          {label}
        </span>
        <span className="text-muted-foreground">
          {run.seed === null ? "No seed" : `Seed ${run.seed}`}
        </span>
        <time dateTime={run.createdAt} className="text-muted-foreground">
          {startedAt(run.createdAt)}
        </time>
        {run.configurationName && <span>{run.configurationName}</span>}
        {UNFINISHED_STATES.has(run.state) && (
          <Button
            variant="outline"
            size="xs"
            aria-label={`Cancel run ${run.id}`}
            disabled={isCancelling}
            onClick={onCancel}
          >
            {isCancelling ? "Cancelling…" : "Cancel"}
          </Button>
        )}
      </div>
      {run.state === "failed" && run.error && (
        <p className="text-sm break-words text-destructive">{run.error}</p>
      )}
      {run.state === "done" &&
        (run.outputs.length === 0 ? (
          <p className="text-sm text-muted-foreground">The run wrote no files.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {run.outputs.map((output) => (
              <RunOutputItem
                key={output.id}
                output={output}
                onOpen={() => onOpenOutput(output.id)}
                onSetVerdict={(verdict) => onSetVerdict(output.id, verdict)}
                onSetNote={(note) => onSetNote(output.id, note)}
              />
            ))}
          </ul>
        ))}
    </li>
  )
}

/** When a run was queued, as a day and a time. */
function startedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * `run` with only the outputs `filter` keeps, or nothing when it keeps none of them. A run not yet
 * finished has no outputs to filter, so it stays.
 */
function withOutputsKept(run: RunRecord, filter: Exclude<VerdictFilter, "all">): RunRecord[] {
  if (UNFINISHED_STATES.has(run.state)) return [run]
  const outputs = run.outputs.filter((output) => keeps(filter, output))
  return outputs.length === 0 ? [] : [{ ...run, outputs }]
}

function keeps(filter: Exclude<VerdictFilter, "all">, output: RunOutput): boolean {
  return filter === "unmarked" ? output.verdict === null : output.verdict === filter
}
