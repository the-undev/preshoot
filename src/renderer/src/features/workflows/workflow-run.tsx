import { Alert, AlertDescription } from "@renderer/design-system"
import type { WorkflowDetail } from "@renderer/lib/trpc"
import { RunForm } from "./run-form"
import { RunList } from "./run-list"
import { useRunForm, useRuns } from "./use-runs"

/** A workflow's slots as a form to queue it with, and the runs it has had. */
export function WorkflowRun({ workflow }: { workflow: WorkflowDetail }): React.JSX.Element {
  const form = useRunForm(workflow.id)
  const runs = useRuns(workflow.id)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Run</h2>
        {form.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">{form.errorMessage}</AlertDescription>
          </Alert>
        )}
        {form.savedValues ? (
          // Keyed on the snapshot, so taking the source's changes starts the form again from them.
          <RunForm
            key={workflow.contentHash}
            slots={workflow.slots}
            savedValues={form.savedValues}
            blockedReason={form.blockedReason}
            isQueueing={form.isQueueing}
            onQueue={form.queue}
            onPickFile={form.pickFile}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Reading the values saved in the workflow…</p>
        )}
      </section>
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Runs</h2>
        <RunList
          runs={runs.runs}
          positions={runs.positions}
          pollError={runs.pollError}
          onOpenOutput={runs.openOutput}
        />
      </section>
    </div>
  )
}
