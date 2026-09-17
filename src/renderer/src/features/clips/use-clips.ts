import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type ClipSummary } from "@renderer/lib/trpc"

/** The project's clips and the calls that add and remove them. */
export interface ClipsPanel {
  clips: ClipSummary[]
  /** Adds a scratch clip and hands back its id, since a new clip opens in the tab that made it. */
  create(opened: (clipId: number) => void): void
  branch(id: number, opened: (clipId: number) => void): void
  /** Reads a pasted prompt into a scratch clip, which opens the same way a new one does. */
  paste(text: string, opened: (clipId: number) => void): void
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
  const branch = useMutation(trpc.clips.branch.mutationOptions({ onSuccess: refresh }))
  const paste = useMutation(trpc.clips.paste.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(
    trpc.clips.remove.mutationOptions({
      onSuccess: async () => {
        await refresh()
        await queryClient.invalidateQueries({ queryKey: trpc.tabs.pathKey() })
      },
    })
  )

  return {
    clips: clips.data ?? [],
    create: (opened) => create.mutate(undefined, { onSuccess: (clip) => opened(clip.id) }),
    branch: (id, opened) => branch.mutate({ id }, { onSuccess: (clip) => opened(clip.id) }),
    paste: (text, opened) => paste.mutate({ text }, { onSuccess: (clip) => opened(clip.id) }),
    remove: (id) => remove.mutate({ id }),
    isSaving: create.isPending || branch.isPending || paste.isPending || remove.isPending,
    errorMessage:
      create.error?.message ??
      branch.error?.message ??
      paste.error?.message ??
      remove.error?.message ??
      null,
  }
}
