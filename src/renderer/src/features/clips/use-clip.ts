import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useTRPC,
  type ClipComposition,
  type ClipPrompt,
  type LineInput,
  type Vocabularies,
} from "@renderer/lib/trpc"
import type { SubjectEdit, SubjectFields } from "./clip-cast"

export type { SubjectEdit }

/** Everything one shot holds, as the editor sends it back. */
export interface ShotFields {
  durationMs: number
  cameraMotion: string | null
  amplitude: string | null
  speed: string | null
  transition: string | null
  lighting: string | null
  soundNote: string
  lines: LineInput[]
}

/** The shot a clip was just given, which is always the one on the end. */
function lastShotIn(composition: ClipComposition): number {
  return composition.shots[composition.shots.length - 1].id
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
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
  save(name: string): void
  branch(opened: (clipId: number) => void): void
  isSaved: boolean
  setFrame(role: "first" | "last", imageId: number | null): void
  /** Adds a shot and says which one, so the editor can take the user to it. */
  addShot(added: (shotId: number) => void): void
  addSavedShot(savedShotId: number, added: (shotId: number) => void): void
  saveShot(shotId: number, name: string): void
  updateShot(shotId: number, fields: ShotFields): void
  moveShot(shotId: number, toPosition: number): void
  removeShot(shotId: number): void
  addSubject(fields: SubjectFields): void
  updateSubject(subjectId: number, fields: SubjectEdit): void
  saveSubject(subjectId: number): void
  removeSubject(subjectId: number): void
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
  const reachOptions = trpc.clips.reach.queryOptions({ clipId })
  const reach = useQuery(reachOptions)

  // Every change rewrites the prompt and what there is to go back to, so neither goes stale.
  const replace = async (next: ClipComposition): Promise<void> => {
    queryClient.setQueryData(compositionOptions.queryKey, next)
    await queryClient.invalidateQueries({ queryKey: promptOptions.queryKey })
    await queryClient.invalidateQueries({ queryKey: reachOptions.queryKey })
  }

  const composed = { onSuccess: replace }
  const setFrame = useMutation(trpc.clips.setFrame.mutationOptions(composed))
  const addShot = useMutation(trpc.clips.addShot.mutationOptions(composed))
  const addSavedShot = useMutation(trpc.clips.addSavedShot.mutationOptions(composed))
  const saveShot = useMutation(
    trpc.clips.saveShot.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.clips.savedShots.queryKey() })
      },
    })
  )
  const updateShot = useMutation(trpc.clips.updateShot.mutationOptions(composed))
  const moveShot = useMutation(trpc.clips.moveShot.mutationOptions(composed))
  const removeShot = useMutation(trpc.clips.removeShot.mutationOptions(composed))
  const addSubject = useMutation(trpc.clips.addSubject.mutationOptions(composed))
  const updateSubject = useMutation(trpc.clips.updateSubject.mutationOptions(composed))
  const removeSubject = useMutation(trpc.clips.removeSubject.mutationOptions(composed))
  const undo = useMutation(trpc.clips.undo.mutationOptions(composed))
  const redo = useMutation(trpc.clips.redo.mutationOptions(composed))
  const saveSubject = useMutation(
    trpc.assets.save.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.assets.pathKey() })
      },
    })
  )

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
    addSavedShot,
    saveShot,
    updateShot,
    moveShot,
    removeShot,
    addSubject,
    updateSubject,
    removeSubject,
    saveSubject,
    updateClip,
    undo,
    redo,
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
    undo: () => undo.mutate({ clipId }),
    redo: () => redo.mutate({ clipId }),
    canUndo: reach.data?.back ?? false,
    canRedo: reach.data?.forward ?? false,
    save: (name) => save.mutate({ id: clipId, name }),
    branch: (opened) => branch.mutate({ id: clipId }, { onSuccess: (copy) => opened(copy.id) }),
    isSaved: (composition.data?.name ?? null) !== null,
    setFrame: (role, imageId) => setFrame.mutate({ clipId, role, imageId }),
    addShot: (added) =>
      addShot.mutate({ clipId }, { onSuccess: (composition) => added(lastShotIn(composition)) }),
    addSavedShot: (savedShotId, added) =>
      addSavedShot.mutate(
        { clipId, savedShotId },
        { onSuccess: (composition) => added(lastShotIn(composition)) }
      ),
    saveShot: (shotId, name) => saveShot.mutate({ shotId, name }),
    updateShot: (shotId, fields) => updateShot.mutate({ shotId, ...fields }),
    moveShot: (shotId, toPosition) => moveShot.mutate({ shotId, toPosition }),
    removeShot: (shotId) => removeShot.mutate({ shotId }),
    addSubject: (fields) => addSubject.mutate({ clipId, ...fields }),
    updateSubject: (subjectId, fields) => updateSubject.mutate({ subjectId, ...fields }),
    saveSubject: (subjectId) => saveSubject.mutate({ id: subjectId }),
    removeSubject: (subjectId) => removeSubject.mutate({ subjectId }),
  }
}
