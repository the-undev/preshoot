import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type ClipSummary } from "@renderer/lib/trpc"

/** The project's clips and the calls that add and remove them. */
export interface ClipsPanel {
  clips: ClipSummary[]
  create(name: string): void
  remove(id: number): void
  isSaving: boolean
  errorMessage: string | null
}

/** Reads the project's clips and keeps the list fresh as it changes. */
export function useClips(): ClipsPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const clips = useQuery(trpc.clips.list.queryOptions())

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.clips.pathKey() })
  }

  const create = useMutation(trpc.clips.create.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(trpc.clips.remove.mutationOptions({ onSuccess: refresh }))

  return {
    clips: clips.data ?? [],
    create: (name) => create.mutate({ name }),
    remove: (id) => remove.mutate({ id }),
    isSaving: create.isPending || remove.isPending,
    errorMessage: create.error?.message ?? remove.error?.message ?? null,
  }
}
