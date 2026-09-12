import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type GenerationRecord } from "@renderer/lib/trpc"

/** One way of writing a clip, as the picker shows it. */
export interface ComposerOption {
  id: string
  name: string
}

/** Writing a clip: the ways to do it, what came back, and what is in flight. */
export interface GeneratePanel {
  composers: ComposerOption[]
  composerId: string
  chooseComposer(id: string): void
  generations: GenerationRecord[]
  latest: GenerationRecord | null
  generate(): void
  regenerateShot(shotId: number): void
  isPending: boolean
  errorMessage: string | null
}

/** Writes one clip, keeps its history fresh, and rewrites a single shot of the newest result. */
export function useGenerateClip(clipId: number): GeneratePanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<string | null>(null)

  const ways = useQuery(trpc.prompts.composers.queryOptions())
  const generations = useQuery(trpc.prompts.list.queryOptions({ clipId }))

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.prompts.pathKey() })
  }

  const generate = useMutation(trpc.prompts.generate.mutationOptions({ onSuccess: refresh }))
  const regenerate = useMutation(
    trpc.prompts.regenerateShot.mutationOptions({ onSuccess: refresh })
  )

  const composerId = chosen ?? ways.data?.defaultId ?? ""
  const latest = generations.data?.[0] ?? null

  return {
    composers: ways.data?.composers ?? [],
    composerId,
    chooseComposer: setChosen,
    generations: generations.data ?? [],
    latest,
    generate: () => generate.mutate({ clipId, composerId }),
    regenerateShot: (shotId) => {
      if (latest) regenerate.mutate({ generationId: latest.id, shotId })
    },
    isPending: generate.isPending || regenerate.isPending,
    errorMessage: generate.error?.message ?? regenerate.error?.message ?? null,
  }
}
