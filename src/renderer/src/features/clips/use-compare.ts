import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type GenerationRecord, type RunSummary } from "@renderer/lib/trpc"

/** One way of writing a clip, with the prompt it should use. */
export interface ComparePair {
  composerId: string
  variantId: string | null
}

/** Where a run stopped, when it did not finish. */
export interface RunFailure {
  composerId: string
  message: string
}

/** Running one clip several ways, reading a run back, and judging what came out. */
export interface ComparePanel {
  runs: RunSummary[]
  runId: string | null
  chooseRun(runId: string): void
  results: GenerationRecord[]
  failure: RunFailure | null
  run(pairs: ComparePair[]): void
  setVerdict(generationId: number, verdict: "good" | "bad" | null): void
  setNote(generationId: number, note: string): void
  isPending: boolean
  errorMessage: string | null
}

/** Writes one clip several ways at once, and reads any run of it back afterwards. */
export function useCompare(clipId: number): ComparePanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<string | null>(null)

  const runs = useQuery(trpc.prompts.runs.queryOptions({ clipId }))
  const runId = chosen ?? runs.data?.[0]?.runId ?? null
  const results = useQuery({
    ...trpc.prompts.run.queryOptions({ runId: runId ?? "" }),
    enabled: runId !== null,
  })

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.prompts.pathKey() })
  }

  const compare = useMutation(
    trpc.prompts.compare.mutationOptions({
      onSuccess: async (answer) => {
        setChosen(answer.runId)
        await refresh()
      },
    })
  )
  const verdict = useMutation(trpc.prompts.setVerdict.mutationOptions({ onSuccess: refresh }))
  const note = useMutation(trpc.prompts.setNote.mutationOptions({ onSuccess: refresh }))

  return {
    runs: runs.data ?? [],
    runId,
    chooseRun: setChosen,
    results: results.data ?? [],
    // The failure belongs to the run that has just been written, not to one read back.
    failure:
      compare.data?.failure && compare.data.runId === runId
        ? { composerId: compare.data.failure.composerId, message: compare.data.failure.message }
        : null,
    run: (pairs) => compare.mutate({ clipId, runs: pairs }),
    setVerdict: (generationId, value) => verdict.mutate({ generationId, verdict: value }),
    setNote: (generationId, value) => note.mutate({ generationId, note: value }),
    isPending: compare.isPending || verdict.isPending || note.isPending,
    errorMessage: compare.error?.message ?? verdict.error?.message ?? note.error?.message ?? null,
  }
}
