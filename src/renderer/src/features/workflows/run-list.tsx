import type { RunRecord, RunState } from "@renderer/lib/trpc"

/** What each state is called, and the colour its chip takes. */
const STATE_CHIPS: Record<RunState, { label: string; className: string }> = {
  queued: { label: "Queued", className: "border-input text-muted-foreground" },
  running: { label: "Running", className: "border-chosen text-foreground" },
  failed: { label: "Failed", className: "border-destructive text-destructive" },
  done: { label: "Done", className: "border-input bg-muted text-foreground" },
}

interface RunListProps {
  runs: RunRecord[]
  positions: Record<number, number | null>
  pollError: string | null
  onOpenOutput: (outputId: number) => void
}

/** A workflow's runs, newest first, each as one slim row. */
export function RunList({
  runs,
  positions,
  pollError,
  onOpenOutput,
}: RunListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {pollError && (
        <p className="text-sm text-destructive">
          Could not ask ComfyUI how runs stand: {pollError}
        </p>
      )}
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing queued yet.</p>
      ) : (
        <ul className="flex flex-col">
          {runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              position={positions[run.id] ?? null}
              onOpenOutput={onOpenOutput}
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
  onOpenOutput: (outputId: number) => void
}

/** One run: its state, its seed, when it was queued, and its error or its files. */
function RunRow({ run, position, onOpenOutput }: RunRowProps): React.JSX.Element {
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
      </div>
      {run.state === "failed" && run.error && (
        <p className="text-sm break-words text-destructive">{run.error}</p>
      )}
      {run.state === "done" &&
        (run.outputs.length === 0 ? (
          <p className="text-sm text-muted-foreground">The run wrote no files.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {run.outputs.map((output) => (
              <li key={output.id}>
                <button
                  type="button"
                  className="text-sm underline-offset-4 hover:underline"
                  aria-label={`Open ${fileName(output.path)}`}
                  onClick={() => onOpenOutput(output.id)}
                >
                  {fileName(output.path)}
                </button>
              </li>
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

function fileName(path: string): string {
  return path.split("/").pop() ?? path
}
