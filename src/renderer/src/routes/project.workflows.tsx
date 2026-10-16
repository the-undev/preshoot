import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Alert, AlertDescription } from "@renderer/design-system"
import { useOpenSettings } from "@renderer/features/settings/settings-dialog-context"
import { useWorkflow, useWorkflows } from "@renderer/features/workflows/use-workflows"
import { WorkflowList } from "@renderer/features/workflows/workflow-list"
import { WorkflowGuide, WorkflowMapping } from "@renderer/features/workflows/workflow-mapping"
import { WorkflowSource } from "@renderer/features/workflows/workflow-source"

/** Which workflow is open beside the list, when one is. */
interface WorkflowsSearch {
  workflow?: number
}

export const Route = createFileRoute("/project/workflows")({
  validateSearch: (search: Record<string, unknown>): WorkflowsSearch =>
    typeof search.workflow === "number" ? { workflow: search.workflow } : {},
  component: Workflows,
})

function Workflows(): React.JSX.Element {
  const { workflow: workflowId } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const openSettings = useOpenSettings()
  const panel = useWorkflows()
  const open = (id: number): void => void navigate({ search: { workflow: id } })

  return (
    <main className="mx-auto grid h-full w-full max-w-[1920px] gap-8 overflow-y-auto p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
      <section className="flex min-w-0 flex-col gap-4">
        {panel.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{panel.errorMessage}</AlertDescription>
          </Alert>
        )}
        <WorkflowList
          folder={panel.folder}
          workflows={panel.workflows}
          selectedId={workflowId ?? null}
          isImporting={panel.isImporting}
          onOpen={open}
          onImport={(path) => panel.importFile(path, open)}
          onRefresh={panel.refresh}
          onOpenSettings={openSettings}
        />
      </section>

      {workflowId === undefined ? (
        <p className="text-sm text-muted-foreground">
          Open a workflow to see its inputs and the tier each one is shown at.
        </p>
      ) : (
        <OpenWorkflow key={workflowId} workflowId={workflowId} />
      )}
    </main>
  )
}

/** One workflow: where its source stands, its mapping, and its guide. */
function OpenWorkflow({ workflowId }: { workflowId: number }): React.JSX.Element {
  const panel = useWorkflow(workflowId)
  const workflow = panel.workflow

  if (!workflow) {
    return panel.errorMessage ? (
      <Alert variant="destructive">
        <AlertDescription>{panel.errorMessage}</AlertDescription>
      </Alert>
    ) : (
      <p className="text-sm text-muted-foreground">Loading the workflow…</p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col">
        <h2 className="font-heading text-lg font-semibold">{workflow.name}</h2>
        <p className="truncate text-xs text-muted-foreground">{workflow.sourcePath}</p>
      </div>

      <WorkflowSource
        status={panel.source}
        isChecking={panel.isChecking}
        isApplying={panel.isApplying}
        onRefresh={panel.checkSource}
        onApply={panel.applyUpdate}
      />

      {panel.errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{panel.errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* The mapping is worked in and the guide is read, so on a wide screen they sit side by side. */}
      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">Mapping</h2>
          <WorkflowMapping slots={workflow.slots} onSetTier={panel.setTier} />
        </section>
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">Guide</h2>
          <WorkflowGuide guide={workflow.guide} />
        </section>
      </div>
    </div>
  )
}
