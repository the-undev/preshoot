import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useTRPC,
  type SlotTier,
  type SourceStatus,
  type WorkflowDetail,
  type WorkflowFolder,
  type WorkflowSummary,
} from "@renderer/lib/trpc"

/** The workflows folder and the project's workflows, and the call that imports one. */
export interface WorkflowsPanel {
  folder: WorkflowFolder | undefined
  workflows: WorkflowSummary[]
  importFile(path: string, onImported: (workflowId: number) => void): void
  refresh(): void
  isImporting: boolean
  errorMessage: string | null
}

/** Reads the workflows folder and the project's workflows, again each time they are shown. */
export function useWorkflows(): WorkflowsPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const folder = useQuery(trpc.workflows.files.queryOptions())
  const workflows = useQuery(trpc.workflows.list.queryOptions())

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.workflows.pathKey() })
  }
  const importing = useMutation(trpc.workflows.import.mutationOptions({ onSuccess: refresh }))

  return {
    folder: folder.data,
    workflows: workflows.data ?? [],
    importFile: (path, onImported) =>
      importing.mutate({ path }, { onSuccess: (workflow) => onImported(workflow.id) }),
    refresh: () => void refresh(),
    isImporting: importing.isPending,
    errorMessage: importing.error?.message ?? folder.error?.message ?? null,
  }
}

/** One workflow, how its source stands, and the calls that change its mapping. */
export interface WorkflowPanel {
  workflow: WorkflowDetail | undefined
  source: SourceStatus | undefined
  isChecking: boolean
  checkSource(): void
  setTier(slotId: number, tier: SlotTier): void
  applyUpdate(contentHash: string): void
  isApplying: boolean
  errorMessage: string | null
}

/** Reads one workflow and checks its source file each time it is shown. */
export function useWorkflow(workflowId: number): WorkflowPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const workflow = useQuery(trpc.workflows.get.queryOptions({ workflowId }))
  const source = useQuery(trpc.workflows.checkSource.queryOptions({ workflowId }))

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.workflows.pathKey() })
    // The run form starts from the graph's values, which an applied update changes.
    await queryClient.invalidateQueries({ queryKey: trpc.runs.values.pathKey() })
  }
  const setTier = useMutation(trpc.workflows.setTier.mutationOptions({ onSuccess: refresh }))
  const apply = useMutation(trpc.workflows.applyUpdate.mutationOptions({ onSuccess: refresh }))

  return {
    workflow: workflow.data,
    source: source.data,
    isChecking: source.isFetching,
    checkSource: () => void source.refetch(),
    setTier: (slotId, tier) => setTier.mutate({ slotId, tier }),
    applyUpdate: (contentHash) => apply.mutate({ workflowId, contentHash }),
    isApplying: apply.isPending,
    // The message from main already says what the user can do about it.
    errorMessage:
      apply.error?.message ??
      setTier.error?.message ??
      workflow.error?.message ??
      source.error?.message ??
      null,
  }
}
