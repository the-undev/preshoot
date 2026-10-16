import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import {
  useTRPC,
  useTRPCClient,
  type LibraryFolder,
  type OutputExport,
  type RunBinding,
  type RunRecord,
  type SavedSlotValue,
  type Verdict,
  type VerdictCounts,
} from "@renderer/lib/trpc"
import type { FileKind } from "./run-form"

/** How often unfinished runs are asked about while the screen is open. */
const POLL_INTERVAL_MS = 1_500

/** How often an unreachable ComfyUI is asked again, so starting it unblocks the form. */
const STATUS_RETRY_MS = 5_000

/** What the run form needs: the values it starts from, whether it can queue, and its calls. */
export interface RunFormPanel {
  savedValues: SavedSlotValue[] | undefined
  blockedReason: string | null
  isQueueing: boolean
  queue(bindings: RunBinding[], count: number, configurationId: number | null): void
  pickFile(kind: FileKind): Promise<string | null>
  library: LibraryFolder | undefined
  errorMessage: string | null
}

/**
 * Reads a workflow's saved values, whether ComfyUI answers and what the library holds, and queues
 * runs of it.
 */
export function useRunForm(workflowId: number): RunFormPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const values = useQuery(trpc.runs.values.queryOptions({ workflowId }))
  const settings = useQuery(trpc.settings.get.queryOptions())
  const status = useQuery(
    trpc.settings.comfyUiStatus.queryOptions(undefined, {
      refetchInterval: (query) =>
        query.state.data?.state === "unreachable" ? STATUS_RETRY_MS : false,
    })
  )
  const queue = useMutation(
    trpc.runs.queue.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.runs.list.pathKey() }),
    })
  )
  const pickFile = useMutation(trpc.runs.pickFile.mutationOptions())
  const library = useQuery(trpc.library.entries.queryOptions())

  return {
    savedValues: values.data,
    blockedReason: blockedReason(status.data?.state, settings.data?.comfyUiUrl),
    isQueueing: queue.isPending,
    queue: (bindings, count, configurationId) =>
      queue.mutate({ workflowId, bindings, count, configurationId }),
    pickFile: (kind) => pickFile.mutateAsync({ kind }),
    library: library.data,
    errorMessage: queue.error?.message ?? pickFile.error?.message ?? values.error?.message ?? null,
  }
}

/** Why nothing can be queued yet, or nothing when ComfyUI answers. */
function blockedReason(
  state: "reachable" | "unreachable" | undefined,
  url: string | undefined
): string | null {
  if (state === undefined) return "Checking ComfyUI…"
  if (state === "reachable") return null
  return `ComfyUI does not answer at ${url ?? "the saved URL"}. Start it, or change the URL in settings.`
}

/** A workflow's runs, where waiting ones stand in the queue, and the call that opens an output. */
export interface RunsPanel {
  runs: RunRecord[]
  positions: Record<number, number | null>
  pollError: string | null
  openOutput(outputId: number): void
}

/** Lists a workflow's runs and asks ComfyUI about the unfinished ones until none are left. */
export function useRuns(workflowId: number): RunsPanel {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const queryClient = useQueryClient()
  const runs = useQuery(trpc.runs.list.queryOptions({ workflowId }))
  const openOutput = useMutation(trpc.runs.openOutput.mutationOptions())
  const [positions, setPositions] = useState<Record<number, number | null>>({})
  const [pollError, setPollError] = useState<string | null>(null)

  // A string, so the effect restarts only when the set of unfinished runs changes.
  const unfinished = (runs.data ?? [])
    .filter((run) => run.state === "queued" || run.state === "running")
    .map((run) => run.id)
    .join(",")

  useEffect(() => {
    if (unfinished === "") return
    const runIds = unfinished.split(",").map(Number)
    let inFlight = false
    const poll = async (): Promise<void> => {
      if (inFlight) return
      inFlight = true
      try {
        const statuses = await Promise.all(
          runIds.map((runId) => client.runs.poll.mutate({ runId }))
        )
        setPositions((current) => ({
          ...current,
          ...Object.fromEntries(statuses.map((status) => [status.run.id, status.position])),
        }))
        setPollError(null)
      } catch (error) {
        setPollError(error instanceof Error ? error.message : String(error))
      } finally {
        inFlight = false
        await queryClient.invalidateQueries({
          queryKey: trpc.runs.list.queryKey({ workflowId }),
        })
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [unfinished, client, queryClient, trpc, workflowId])

  return {
    runs: runs.data ?? [],
    positions,
    pollError: pollError ?? openOutput.error?.message ?? runs.error?.message ?? null,
    openOutput: (outputId) => openOutput.mutate({ outputId }),
  }
}

/** What a workflow's outputs count before the counts are read. */
const NO_COUNTS: VerdictCounts = { all: 0, good: 0, bad: 0, unmarked: 0 }

/** How many outputs each verdict has, the calls that give one, and the export of the good ones. */
export interface ReviewPanel {
  counts: VerdictCounts
  setVerdict(outputId: number, verdict: Verdict | null): void
  setNote(outputId: number, note: string): void
  isExporting: boolean
  /** What the last export did, or nothing before the first. */
  lastExport: OutputExport | null
  exportGood(): void
  errorMessage: string | null
}

/** Reads a workflow's verdict counts, marks and notes its outputs, and exports the good ones. */
export function useReview(workflowId: number): ReviewPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const counts = useQuery(trpc.review.counts.queryOptions({ workflowId }))
  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.runs.list.queryKey({ workflowId }) }),
      queryClient.invalidateQueries({ queryKey: trpc.review.counts.queryKey({ workflowId }) }),
    ])
  }
  const setVerdict = useMutation(trpc.review.setVerdict.mutationOptions({ onSuccess: refresh }))
  const setNote = useMutation(trpc.review.setNote.mutationOptions({ onSuccess: refresh }))
  const exportGood = useMutation(trpc.review.exportGood.mutationOptions())

  return {
    counts: counts.data ?? NO_COUNTS,
    setVerdict: (outputId, verdict) => setVerdict.mutate({ outputId, verdict }),
    setNote: (outputId, note) => setNote.mutate({ outputId, note }),
    isExporting: exportGood.isPending,
    lastExport: exportGood.data ?? null,
    exportGood: () => exportGood.mutate({ workflowId }),
    errorMessage:
      setVerdict.error?.message ??
      setNote.error?.message ??
      exportGood.error?.message ??
      counts.error?.message ??
      null,
  }
}
