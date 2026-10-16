import { ChevronRight, Ellipsis } from "lucide-react"
import { useState } from "react"
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/design-system"
import { cutAtWord } from "@renderer/lib/cut-at-word"
import { fileName } from "@renderer/lib/file-name"
import type {
  RunOutput,
  RunRecord,
  RunState,
  Verdict,
  VerdictFilter,
  WorkflowSlot,
} from "@renderer/lib/trpc"
import { RunOutputItem } from "./run-output"
import { shownName } from "./slot-labels"

/** What each state is called, and the colour its chip takes. */
const STATE_CHIPS: Record<RunState, { label: string; className: string }> = {
  queued: { label: "Queued", className: "border-input text-muted-foreground" },
  running: { label: "Running", className: "border-chosen text-foreground" },
  failed: { label: "Failed", className: "border-destructive text-destructive" },
  done: { label: "Done", className: "border-input bg-muted text-foreground" },
}

/** The states of a run ComfyUI has not finished with. */
const UNFINISHED_STATES: ReadonlySet<RunState> = new Set(["queued", "running"])

/** How a run filled one slot, as its record keeps it. */
type RunBindingRecord = RunRecord["bindings"][number]

interface RunListProps {
  runs: RunRecord[]
  /** The workflow's slots as they are now, which name the slots a run filled. */
  slots: WorkflowSlot[]
  positions: Record<number, number | null>
  pollError: string | null
  cancelError: string | null
  deleteError: string | null
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
  onDelete: (runId: number) => void
}

/** A workflow's runs, newest first, each as one slim row with its outputs. */
export function RunList({
  runs,
  slots,
  positions,
  pollError,
  cancelError,
  deleteError,
  cancellingRunIds,
  filter,
  onOpenOutput,
  onSetVerdict,
  onSetNote,
  onCancel,
  onDelete,
}: RunListProps): React.JSX.Element {
  const shown = filter === "all" ? runs : runs.flatMap((run) => withOutputsKept(run, filter))
  // Counted before the filter, since a delete takes every file whatever shows.
  const fileCounts = new Map(runs.map((run) => [run.id, run.outputs.length]))
  return (
    <div className="flex flex-col gap-2">
      {pollError && (
        <p className="text-sm text-destructive">
          Could not ask ComfyUI how runs stand: {pollError}
        </p>
      )}
      {cancelError && <p className="text-sm break-words text-destructive">{cancelError}</p>}
      {deleteError && <p className="text-sm break-words text-destructive">{deleteError}</p>}
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
              slots={slots}
              fileCount={fileCounts.get(run.id) ?? 0}
              position={positions[run.id] ?? null}
              isCancelling={cancellingRunIds.has(run.id)}
              onOpenOutput={onOpenOutput}
              onSetVerdict={onSetVerdict}
              onSetNote={onSetNote}
              onCancel={() => onCancel(run.id)}
              onDelete={() => onDelete(run.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface RunRowProps {
  run: RunRecord
  slots: WorkflowSlot[]
  /** How many files the run wrote, whichever of them the filter shows. */
  fileCount: number
  position: number | null
  isCancelling: boolean
  onOpenOutput: (outputId: number) => void
  onSetVerdict: (outputId: number, verdict: Verdict | null) => void
  onSetNote: (outputId: number, note: string) => void
  onCancel: () => void
  onDelete: () => void
}

/**
 * One run: its state, its seed, when it was queued, the configuration it came from, a way to
 * cancel it while unfinished or delete it once finished, what it sent behind a fold, and its
 * error or its files.
 */
function RunRow({
  run,
  slots,
  fileCount,
  position,
  isCancelling,
  onOpenOutput,
  onSetVerdict,
  onSetNote,
  onCancel,
  onDelete,
}: RunRowProps): React.JSX.Element {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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
        {!UNFINISHED_STATES.has(run.state) &&
          (confirmingDelete ? (
            <span className="ml-auto flex items-center gap-2">
              <span>{deleteQuestion(fileCount)}</span>
              <Button size="xs" variant="destructive" onClick={onDelete}>
                Delete
              </Button>
              <Button size="xs" variant="outline" onClick={() => setConfirmingDelete(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  className="ml-auto"
                  aria-label={`More for run ${run.id}`}
                >
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
      </div>
      <RunDetails bindings={run.bindings} slots={slots} />
      {run.state === "failed" && run.error && <RunError error={run.error} />}
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

/** How many lines of a failure show before the rest is folded away. */
const ERROR_LINES = 2

/** How many characters of a failure show before the rest is folded away. */
const ERROR_LENGTH = 200

/** Why a run failed: its start, with the rest behind a toggle when there is more. */
function RunError({ error }: { error: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const whole = error.trim()
  const start = errorStart(whole)
  const folded = start !== whole
  return (
    <div className="flex flex-col items-start gap-0.5">
      <p className="text-sm break-words whitespace-pre-wrap text-destructive">
        {open || !folded ? whole : start}
      </p>
      {folded && (
        <Button variant="link" size="xs" className="px-0" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show all"}
        </Button>
      )}
    </div>
  )
}

/** The first lines of a failure, cut at a word when they run long, marked when cut. */
function errorStart(error: string): string {
  const firstLines = error.split("\n").slice(0, ERROR_LINES).join("\n")
  const cut = cutAtWord(firstLines, ERROR_LENGTH)
  return cut === firstLines && firstLines !== error ? `${firstLines.trimEnd()}…` : cut
}

/** What each slot of a run was sent, behind a fold. */
function RunDetails({
  bindings,
  slots,
}: {
  bindings: RunBindingRecord[]
  slots: WorkflowSlot[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const slotNames = new Map(slots.map((slot) => [slot.id, shownName(slot)]))
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="xs" className="-ml-2 gap-1 text-muted-foreground">
          <ChevronRight className={open ? "size-3 rotate-90 transition-transform" : "size-3"} />
          Details
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        {bindings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every slot ran as saved.</p>
        ) : (
          <dl className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            {bindings.map((binding) => (
              <div key={binding.slotId} className="contents">
                {/* A slot gone since the run is called what it was called then. */}
                <dt className="truncate text-muted-foreground">
                  {slotNames.get(binding.slotId) ?? binding.slotName}
                </dt>
                <SentValue binding={binding} />
              </div>
            ))}
          </dl>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** What one slot was sent: off, a file's name, a value kept as saved, or the value itself. */
function SentValue({ binding }: { binding: RunBindingRecord }): React.JSX.Element {
  if (!binding.on) return <dd className="text-muted-foreground">off</dd>
  if (binding.file !== null) return <dd className="truncate">{fileName(binding.file)}</dd>
  if (binding.value === null) return <dd className="text-muted-foreground">as saved</dd>
  if (typeof binding.value === "boolean") return <dd>{binding.value ? "yes" : "no"}</dd>
  const text = String(binding.value)
  // Long prompts are clipped to a few lines, with the whole text on hover.
  return (
    <dd title={text} className="line-clamp-3 break-words whitespace-pre-wrap">
      {text}
    </dd>
  )
}

/** What deleting a run asks, naming the files that go with it. */
function deleteQuestion(fileCount: number): string {
  if (fileCount === 0) return "Delete run?"
  return fileCount === 1
    ? "Delete run? Its file goes too."
    : `Delete run? Its ${fileCount} files go too.`
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
