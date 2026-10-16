import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { useState } from "react"
import {
  Alert,
  AlertDescription,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/design-system"
import { useOpenSettings } from "@renderer/features/settings/settings-dialog-context"
import {
  useWorkflow,
  useWorkflowRemoval,
  useWorkflows,
} from "@renderer/features/workflows/use-workflows"
import { WorkflowList } from "@renderer/features/workflows/workflow-list"
import { WorkflowGuide, WorkflowMapping } from "@renderer/features/workflows/workflow-mapping"
import { WorkflowRemoval } from "@renderer/features/workflows/workflow-removal"
import { WorkflowRun } from "@renderer/features/workflows/workflow-run"
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
          Open a workflow to fill its inputs and queue it.
        </p>
      ) : (
        <OpenWorkflow
          key={workflowId}
          workflowId={workflowId}
          onRemoved={() => navigate({ search: {} })}
        />
      )}
    </main>
  )
}

/**
 * One workflow: where its source stands, the form that queues it, its runs, guide and mapping,
 * and a way to remove it.
 */
function OpenWorkflow({
  workflowId,
  onRemoved,
}: {
  workflowId: number
  onRemoved: () => Promise<void>
}): React.JSX.Element {
  const panel = useWorkflow(workflowId)
  const removal = useWorkflowRemoval(workflowId, onRemoved)
  const workflow = panel.workflow
  const [mappingOpen, setMappingOpen] = useState(false)

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
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <h2 className="font-heading text-lg font-semibold">{workflow.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{workflow.sourcePath}</p>
        </div>
        <WorkflowRemoval
          name={workflow.name}
          configurationCount={removal.configurationCount}
          runCount={removal.runCount}
          isRemoving={removal.isRemoving}
          onRemove={removal.remove}
        />
      </div>

      <WorkflowSource
        status={panel.source}
        isChecking={panel.isChecking}
        isApplying={panel.isApplying}
        onRefresh={panel.checkSource}
        onApply={panel.applyUpdate}
      />

      {(panel.errorMessage ?? removal.errorMessage) && (
        <Alert variant="destructive">
          <AlertDescription>{panel.errorMessage ?? removal.errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* The form is worked in and the guide is read, so on a wide screen they sit side by side. */}
      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <WorkflowRun workflow={workflow} />
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="font-heading text-sm font-semibold text-muted-foreground">Guide</h2>
            <WorkflowGuide guide={workflow.guide} />
          </section>
          {/* Tiers are set once per workflow, so the mapping waits behind a fold. */}
          <Collapsible open={mappingOpen} onOpenChange={setMappingOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
                <ChevronRight
                  className={mappingOpen ? "size-4 rotate-90 transition-transform" : "size-4"}
                />
                Mapping
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <WorkflowMapping slots={workflow.slots} onSetTier={panel.setTier} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  )
}
