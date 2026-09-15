import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useTRPC,
  type ClipComposition,
  type ClipPrompt,
  type LineInput,
  type Vocabularies,
} from "@renderer/lib/trpc"

/** Everything one shot holds, as the editor sends it back. */
export interface ShotFields {
  durationMs: number
  cameraMotion: string | null
  amplitude: string | null
  speed: string | null
  transition: string | null
  lighting: string | null
  soundNote: string
  things: number[]
  lines: LineInput[]
}

/** The clip's own fields, without its shots. Its name is set by saving it, not by editing it. */
export interface ClipFields {
  style: string
  note: string
  musicNote: string
  form: ClipComposition["form"]
  shortEdge: number
  aspectRatio: string
  language: string
}

/** One open clip and every call that changes it. */
export interface ClipPanel {
  composition: ClipComposition | null
  vocabularies: Vocabularies | null
  prompt: ClipPrompt | null
  isSaving: boolean
  errorMessage: string | null
  updateClip(fields: ClipFields): void
  save(name: string): void
  branch(opened: (clipId: number) => void): void
  isSaved: boolean
  setFrame(role: "first" | "last", imageId: number | null): void
  addShot(): void
  updateShot(shotId: number, fields: ShotFields): void
  moveShot(shotId: number, toPosition: number): void
  removeShot(shotId: number): void
  addSpeaker(fields: { assetId: number | null; description: string }): void
  updateSpeaker(speakerId: number, fields: { assetId: number | null; description: string }): void
  removeSpeaker(speakerId: number): void
}

/**
 * Reads one clip and writes it back. Every mutation answers with the whole clip, which goes
 * straight into the cache, so the editor never stitches a partial update together itself.
 */
export function useClip(clipId: number): ClipPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const compositionOptions = trpc.clips.composition.queryOptions({ clipId })
  const promptOptions = trpc.clips.prompt.queryOptions({ clipId })
  const composition = useQuery(compositionOptions)
  const vocabularies = useQuery(trpc.clips.vocabularies.queryOptions({ clipId }))
  const prompt = useQuery(promptOptions)

  // Every change rewrites the prompt, so the panel beside the editor never shows a stale one.
  const replace = async (next: ClipComposition): Promise<void> => {
    queryClient.setQueryData(compositionOptions.queryKey, next)
    await queryClient.invalidateQueries({ queryKey: promptOptions.queryKey })
  }

  const composed = { onSuccess: replace }
  const setFrame = useMutation(trpc.clips.setFrame.mutationOptions(composed))
  const addShot = useMutation(trpc.clips.addShot.mutationOptions(composed))
  const updateShot = useMutation(trpc.clips.updateShot.mutationOptions(composed))
  const moveShot = useMutation(trpc.clips.moveShot.mutationOptions(composed))
  const removeShot = useMutation(trpc.clips.removeShot.mutationOptions(composed))
  const addSpeaker = useMutation(trpc.clips.addSpeaker.mutationOptions(composed))
  const updateSpeaker = useMutation(trpc.clips.updateSpeaker.mutationOptions(composed))
  const removeSpeaker = useMutation(trpc.clips.removeSpeaker.mutationOptions(composed))

  // The clip's own fields change what its tab says, so those queries are refreshed instead.
  const refreshed = {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.clips.pathKey() })
      await queryClient.invalidateQueries({ queryKey: trpc.tabs.pathKey() })
    },
  }
  const updateClip = useMutation(trpc.clips.update.mutationOptions(refreshed))
  const save = useMutation(trpc.clips.save.mutationOptions(refreshed))
  const branch = useMutation(trpc.clips.branch.mutationOptions(refreshed))

  const writes = [
    setFrame,
    addShot,
    updateShot,
    moveShot,
    removeShot,
    addSpeaker,
    updateSpeaker,
    removeSpeaker,
    updateClip,
    save,
    branch,
  ]

  return {
    composition: composition.data ?? null,
    vocabularies: vocabularies.data ?? null,
    prompt: prompt.data ?? null,
    isSaving: writes.some((write) => write.isPending),
    // The message from main already says what the user can do about it.
    errorMessage: writes.map((write) => write.error?.message).find(Boolean) ?? null,
    updateClip: (fields) => updateClip.mutate({ id: clipId, ...fields }),
    save: (name) => save.mutate({ id: clipId, name }),
    branch: (opened) => branch.mutate({ id: clipId }, { onSuccess: (copy) => opened(copy.id) }),
    isSaved: (composition.data?.name ?? null) !== null,
    setFrame: (role, imageId) => setFrame.mutate({ clipId, role, imageId }),
    addShot: () => addShot.mutate({ clipId }),
    updateShot: (shotId, fields) => updateShot.mutate({ shotId, ...fields }),
    moveShot: (shotId, toPosition) => moveShot.mutate({ shotId, toPosition }),
    removeShot: (shotId) => removeShot.mutate({ shotId }),
    addSpeaker: (fields) => addSpeaker.mutate({ clipId, ...fields }),
    updateSpeaker: (speakerId, fields) => updateSpeaker.mutate({ speakerId, ...fields }),
    removeSpeaker: (speakerId) => removeSpeaker.mutate({ speakerId }),
  }
}
