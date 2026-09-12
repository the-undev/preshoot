import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "@renderer/lib/trpc"

/** Editing a prompt into another, and writing one out. */
export interface PromptActions {
  edit(generationId: number, instruction: string): void
  exportToProject(generationId: number): void
  save(generationId: number): void
  openExports(): void
  isEditing: boolean
  isExporting: boolean
  errorMessage: string | null
  exportedTo: string | null
}

/** The three things that can be done to a finished prompt. */
export function usePromptActions(): PromptActions {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.prompts.pathKey() })
  }

  const edit = useMutation(trpc.prompts.edit.mutationOptions({ onSuccess: refresh }))
  const exportToProject = useMutation(trpc.prompts.exportToProject.mutationOptions())
  const save = useMutation(trpc.prompts.exportToFile.mutationOptions())
  const openExports = useMutation(trpc.prompts.openExports.mutationOptions())

  return {
    edit: (generationId, instruction) =>
      edit.mutate({ generationId, instruction, variantId: null }),
    exportToProject: (generationId) => exportToProject.mutate({ generationId }),
    save: (generationId) => save.mutate({ generationId }),
    openExports: () => openExports.mutate(),
    isEditing: edit.isPending,
    isExporting: exportToProject.isPending || save.isPending,
    // The message from main already says what the user can do about it.
    errorMessage:
      edit.error?.message ??
      exportToProject.error?.message ??
      save.error?.message ??
      openExports.error?.message ??
      null,
    // A cancelled save answers with nothing, so nothing is said about it.
    exportedTo: exportToProject.data?.textPath ?? save.data?.textPath ?? null,
  }
}
