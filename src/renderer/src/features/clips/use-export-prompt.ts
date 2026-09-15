import { useMutation } from "@tanstack/react-query"
import { useTRPC } from "@renderer/lib/trpc"

/** Writing a clip's prompt out, and where the last one went. */
export interface ExportPanel {
  isExporting: boolean
  exportedTo: string | null
  errorMessage: string | null
  exportToProject(): void
  saveAs(): void
  openExports(): void
}

/** Writes the prompt of one clip to the project or to a chosen file. */
export function useExportPrompt(clipId: number): ExportPanel {
  const trpc = useTRPC()
  const toProject = useMutation(trpc.prompts.exportToProject.mutationOptions())
  const toFile = useMutation(trpc.prompts.exportToFile.mutationOptions())
  const openExports = useMutation(trpc.prompts.openExports.mutationOptions())

  const writes = [toProject, toFile, openExports]

  return {
    isExporting: toProject.isPending || toFile.isPending,
    exportedTo: toProject.data?.textPath ?? toFile.data?.textPath ?? null,
    // The message from main already says what the user can do about it.
    errorMessage: writes.map((write) => write.error?.message).find(Boolean) ?? null,
    exportToProject: () => toProject.mutate({ clipId }),
    saveAs: () => toFile.mutate({ clipId }),
    openExports: () => openExports.mutate(),
  }
}
