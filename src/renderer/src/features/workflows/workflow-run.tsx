import { useState } from "react"
import { Alert, AlertDescription } from "@renderer/design-system"
import type { Configuration, RunBinding, VerdictFilter, WorkflowDetail } from "@renderer/lib/trpc"
import { ConfigurationStrip } from "./configuration-strip"
import { takeClipTransfer, type SentValue } from "./clip-transfer"
import { ReviewBar } from "./review-bar"
import { RunForm, type FormFields } from "./run-form"
import { RunList } from "./run-list"
import { useConfigurations, type ConfigurationsPanel } from "./use-configurations"
import {
  useReview,
  useRunForm,
  useRuns,
  type ReviewPanel,
  type RunFormPanel,
  type RunsPanel,
} from "./use-runs"

/**
 * A workflow's slots as a form to queue it with, its configurations, and the runs it has had with
 * their outputs to review.
 */
export function WorkflowRun({ workflow }: { workflow: WorkflowDetail }): React.JSX.Element {
  return (
    <WorkflowRunView
      workflow={workflow}
      form={useRunForm(workflow.id)}
      configurations={useConfigurations(workflow.id)}
      runs={useRuns(workflow.id)}
      review={useReview(workflow.id)}
    />
  )
}

/**
 * What the form was last started from, and the values it gave: a configuration loaded into it or
 * saved from it, or a clip's pieces sent to it, which hold while the workflow's snapshot is the
 * one they were sent to.
 */
type FormStart =
  | {
      from: "configuration"
      configurationId: number
      bindings: RunBinding[]
      staleSlotNames: string[]
    }
  | { from: "clip"; clipName: string | null; contentHash: string; bindings: RunBinding[] }

/** A sent value as the form binds it: text and numbers as typed values, a file as one chosen. */
function boundValue(value: SentValue): NonNullable<RunBinding["value"]> {
  if (value.type === "text") return { type: "value", value: value.text }
  if (value.type === "number") return { type: "value", value: value.value }
  return { type: "file", path: value.path }
}

/** The pieces sent from a clip to this workflow, as the form's start, when some are waiting. */
function sentStart(workflow: WorkflowDetail): FormStart | null {
  const transfer = takeClipTransfer(workflow.id)
  if (!transfer) return null
  return {
    from: "clip",
    clipName: transfer.clipName,
    contentHash: workflow.contentHash,
    bindings: transfer.values.map(({ slotId, value }) => ({
      slotId,
      on: true,
      value: boundValue(value),
    })),
  }
}

interface WorkflowRunViewProps {
  workflow: WorkflowDetail
  form: RunFormPanel
  configurations: ConfigurationsPanel
  runs: RunsPanel
  review: ReviewPanel
}

/** The workflow screen's run section, given what it reads and the calls it makes. */
export function WorkflowRunView({
  workflow,
  form,
  configurations,
  runs,
  review,
}: WorkflowRunViewProps): React.JSX.Element {
  // Taken once, so a second visit to the workflow starts from its saved values again.
  const [start, setStart] = useState<FormStart | null>(() => sentStart(workflow))
  const [filter, setFilter] = useState<VerdictFilter>("all")
  // Counts each start by hand, so loading the same configuration again starts the form again.
  const [startCount, setStartCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  // The form's fields as they last stood, which a form started again after a source change keeps.
  const [keptFields, setKeptFields] = useState<FormFields | null>(null)
  const loaded = start?.from === "configuration" ? start : null
  // A source change starts the form again from what it held, so what was sent is then typed in.
  const sent = start?.from === "clip" && start.contentHash === workflow.contentHash ? start : null
  // Looked up in the list, so a rename shows and a deleted one is no longer loaded.
  const loadedConfiguration: Configuration | null =
    configurations.configurations.find((entry) => entry.id === loaded?.configurationId) ?? null

  const load = async (configurationId: number): Promise<void> => {
    setLoadError(null)
    try {
      const result = await configurations.load(configurationId)
      // A load starts the form from the configuration, so nothing typed before it is kept.
      setKeptFields(null)
      setStart({
        from: "configuration",
        configurationId,
        bindings: result.bindings,
        staleSlotNames: result.configuration.staleSlotNames,
      })
      setStartCount((count) => count + 1)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    }
  }
  const startFromWorkflow = (): void => {
    setLoadError(null)
    setKeptFields(null)
    setStart(null)
    setStartCount((count) => count + 1)
  }
  const saved = (configuration: Configuration, bindings: RunBinding[]): void =>
    setStart({
      from: "configuration",
      configurationId: configuration.id,
      bindings,
      staleSlotNames: [],
    })

  const errorMessage = form.errorMessage ?? configurations.errorMessage ?? loadError
  const staleSlotNames = loadedConfiguration ? (loaded?.staleSlotNames ?? []) : []

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Run</h2>
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">{errorMessage}</AlertDescription>
          </Alert>
        )}
        {loadedConfiguration && (
          <p className="text-sm text-muted-foreground">Filled from {loadedConfiguration.name}.</p>
        )}
        {sent && (
          <p className="text-sm text-muted-foreground">
            {sent.clipName === null
              ? "Sent from the clip."
              : `Sent from the clip ${sent.clipName}.`}
          </p>
        )}
        {staleSlotNames.length > 0 && (
          <Alert>
            <AlertDescription>
              No longer in the workflow, so not loaded: {staleSlotNames.join(", ")}.
            </AlertDescription>
          </Alert>
        )}
        {form.savedValues ? (
          // Keyed on the snapshot, its saved values and each start by hand, so taking the source's
          // changes, loading a configuration or going back to the workflow starts the form again. The saved values are in the key since
          // they are read apart from the snapshot and may land after it.
          <RunForm
            key={`${workflow.contentHash}:${JSON.stringify(form.savedValues)}:${startCount}`}
            slots={workflow.slots}
            savedValues={form.savedValues}
            initialBindings={loaded?.bindings ?? sent?.bindings ?? []}
            keptFields={keptFields}
            onFieldsChange={setKeptFields}
            configurationName={loadedConfiguration?.name ?? null}
            hasStart={start !== null}
            onStartFromWorkflow={startFromWorkflow}
            blockedReason={form.blockedReason}
            isQueueing={form.isQueueing}
            onQueue={(bindings, count) =>
              form.queue(bindings, count, loadedConfiguration?.id ?? null)
            }
            onSaveNew={async (name, bindings) =>
              saved(await configurations.saveNew(name, bindings), bindings)
            }
            onUpdate={async (bindings) => {
              if (!loadedConfiguration) return
              saved(await configurations.update(loadedConfiguration.id, bindings), bindings)
            }}
            onPickFile={form.pickFile}
            onReadText={form.readLibraryText}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Reading the values saved in the workflow…</p>
        )}
      </section>
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Configurations</h2>
        <ConfigurationStrip
          configurations={configurations.configurations}
          loadedId={loadedConfiguration?.id ?? null}
          onLoad={(configurationId) => void load(configurationId)}
          onRename={configurations.rename}
          onDuplicate={configurations.duplicate}
          onDelete={configurations.remove}
        />
      </section>
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Runs</h2>
        {review.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">{review.errorMessage}</AlertDescription>
          </Alert>
        )}
        <ReviewBar
          counts={review.counts}
          filter={filter}
          onFilter={setFilter}
          isExporting={review.isExporting}
          lastExport={review.lastExport}
          onExport={review.exportGood}
          onOpenExportFolder={review.openExportFolder}
        />
        <RunList
          runs={runs.runs}
          slots={workflow.slots}
          positions={runs.positions}
          pollError={runs.pollError}
          cancelError={runs.cancelError}
          deleteError={runs.deleteError}
          cancellingRunIds={runs.cancellingRunIds}
          filter={filter}
          onOpenOutput={runs.openOutput}
          onShowFolder={runs.showRunFolder}
          onSetVerdict={review.setVerdict}
          onSetNote={review.setNote}
          onCancel={runs.cancel}
          onDelete={runs.remove}
        />
      </section>
    </div>
  )
}
