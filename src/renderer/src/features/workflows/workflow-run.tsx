import { useState } from "react"
import { Alert, AlertDescription } from "@renderer/design-system"
import type { Configuration, RunBinding, WorkflowDetail } from "@renderer/lib/trpc"
import { ConfigurationStrip } from "./configuration-strip"
import { RunForm } from "./run-form"
import { RunList } from "./run-list"
import { useConfigurations, type ConfigurationsPanel } from "./use-configurations"
import { useRunForm, useRuns, type RunFormPanel, type RunsPanel } from "./use-runs"

/** A workflow's slots as a form to queue it with, its configurations, and the runs it has had. */
export function WorkflowRun({ workflow }: { workflow: WorkflowDetail }): React.JSX.Element {
  return (
    <WorkflowRunView
      workflow={workflow}
      form={useRunForm(workflow.id)}
      configurations={useConfigurations(workflow.id)}
      runs={useRuns(workflow.id)}
    />
  )
}

/** The configuration last loaded into the form or saved from it, and the values it gave. */
interface LoadedState {
  configurationId: number
  bindings: RunBinding[]
  staleSlotNames: string[]
}

interface WorkflowRunViewProps {
  workflow: WorkflowDetail
  form: RunFormPanel
  configurations: ConfigurationsPanel
  runs: RunsPanel
}

/** The workflow screen's run section, given what it reads and the calls it makes. */
export function WorkflowRunView({
  workflow,
  form,
  configurations,
  runs,
}: WorkflowRunViewProps): React.JSX.Element {
  const [loaded, setLoaded] = useState<LoadedState | null>(null)
  // Counts loads, so loading the same configuration again starts the form again from it.
  const [loadCount, setLoadCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Looked up in the list, so a rename shows and a deleted one is no longer loaded.
  const loadedConfiguration: Configuration | null =
    configurations.configurations.find((entry) => entry.id === loaded?.configurationId) ?? null

  const load = async (configurationId: number): Promise<void> => {
    setLoadError(null)
    try {
      const result = await configurations.load(configurationId)
      setLoaded({
        configurationId,
        bindings: result.bindings,
        staleSlotNames: result.configuration.staleSlotNames,
      })
      setLoadCount((count) => count + 1)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    }
  }
  const saved = (configuration: Configuration, bindings: RunBinding[]): void =>
    setLoaded({ configurationId: configuration.id, bindings, staleSlotNames: [] })

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
        {staleSlotNames.length > 0 && (
          <Alert>
            <AlertDescription>
              No longer in the workflow, so not loaded: {staleSlotNames.join(", ")}.
            </AlertDescription>
          </Alert>
        )}
        {form.savedValues ? (
          // Keyed on the snapshot and on each load, so taking the source's changes or loading a
          // configuration starts the form again.
          <RunForm
            key={`${workflow.contentHash}:${loadCount}`}
            slots={workflow.slots}
            savedValues={form.savedValues}
            initialBindings={loaded?.bindings ?? []}
            configurationName={loadedConfiguration?.name ?? null}
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
            library={form.library}
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
