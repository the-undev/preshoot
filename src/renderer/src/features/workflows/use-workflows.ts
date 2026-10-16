import { useEffect } from "react"
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
      importing.mutate({ path }, { onSuccess: (result) => onImported(result.workflow.id) }),
    refresh: () => void refresh(),
    isImporting: importing.isPending,
    errorMessage: importing.error?.message ?? folder.error?.message ?? null,
  }
}

/** What removing a workflow takes with it, and the call that removes it. */
export interface WorkflowRemovalPanel {
  configurationCount: number
  runCount: number
  remove(): void
  isRemoving: boolean
  errorMessage: string | null
}

/**
 * Counts a workflow's configurations and runs and removes it. `onRemoved` moves off the workflow
 * before the lists are read again, so nothing asks for the one that has gone.
 */
export function useWorkflowRemoval(
  workflowId: number,
  onRemoved: () => Promise<void>
): WorkflowRemovalPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const configurations = useQuery(trpc.configurations.list.queryOptions({ workflowId }))
  const runs = useQuery(trpc.runs.list.queryOptions({ workflowId }))
  const remove = useMutation(
    trpc.workflows.remove.mutationOptions({
      onSuccess: async () => {
        await onRemoved()
        await queryClient.invalidateQueries({ queryKey: trpc.workflows.pathKey() })
      },
    })
  )

  return {
    configurationCount: configurations.data?.length ?? 0,
    runCount: runs.data?.length ?? 0,
    remove: () => remove.mutate({ workflowId }),
    isRemoving: remove.isPending,
    errorMessage: remove.error?.message ?? null,
  }
}

/** One workflow, how its source stands, and the calls that change its mapping. */
export interface WorkflowPanel {
  workflow: WorkflowDetail | undefined
  source: SourceStatus | undefined
  isChecking: boolean
  checkSource(): void
  setTier(slotId: number, tier: SlotTier): void
  setLabel(slotId: number, label: { displayName: string; note: string }): void
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
  // A check that applied the source on its own changed the stored copy behind the queries. The
  // check itself is left alone so its note stays until the next check.
  const sourceState = source.data?.state
  const sourceCheckedAt = source.dataUpdatedAt
  useEffect(() => {
    if (sourceState !== "updated") return
    void queryClient.invalidateQueries({ queryKey: trpc.workflows.get.queryKey({ workflowId }) })
    void queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey() })
    void queryClient.invalidateQueries({ queryKey: trpc.runs.values.pathKey() })
  }, [sourceState, sourceCheckedAt, queryClient, trpc, workflowId])
  const setTier = useMutation(trpc.workflows.setTier.mutationOptions({ onSuccess: refresh }))
  const setLabel = useMutation(trpc.workflows.setLabel.mutationOptions({ onSuccess: refresh }))
  const apply = useMutation(trpc.workflows.applyUpdate.mutationOptions({ onSuccess: refresh }))

  return {
    workflow: workflow.data,
    source: source.data,
    isChecking: source.isFetching,
    checkSource: () => void source.refetch(),
    setTier: (slotId, tier) => setTier.mutate({ slotId, tier }),
    setLabel: (slotId, label) => setLabel.mutate({ slotId, ...label }),
    applyUpdate: (contentHash) => apply.mutate({ workflowId, contentHash }),
    isApplying: apply.isPending,
    // The message from main already says what the user can do about it.
    errorMessage:
      apply.error?.message ??
      setTier.error?.message ??
      setLabel.error?.message ??
      workflow.error?.message ??
      source.error?.message ??
      null,
  }
}
