import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type GenerationRecord } from "@renderer/lib/trpc"

/** One way of writing a clip, with the prompt it should use. */
export interface ComparePair {
  composerId: string
  variantId: string | null
}

/** Running one clip several ways and judging what comes back. */
export interface ComparePanel {
  results: GenerationRecord[]
  run(pairs: ComparePair[]): void
  judge(generationId: number, verdict: "good" | "bad" | null, note: string): void
  isPending: boolean
  errorMessage: string | null
}

/** Writes one clip several ways at once and keeps the run to hand for judging. */
export function useCompare(clipId: number): ComparePanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.prompts.pathKey() })
  }

  const compare = useMutation(trpc.prompts.compare.mutationOptions({ onSuccess: refresh }))
  const judge = useMutation(trpc.prompts.judge.mutationOptions({ onSuccess: refresh }))

  return {
    results: compare.data ?? [],
    run: (pairs) => compare.mutate({ clipId, runs: pairs }),
    judge: (generationId, verdict, note) => judge.mutate({ generationId, verdict, note }),
    isPending: compare.isPending || judge.isPending,
    errorMessage: compare.error?.message ?? judge.error?.message ?? null,
  }
}
