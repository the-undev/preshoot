import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type LibraryFolder } from "@renderer/lib/trpc"

/** The library folder's kinds, and the call that copies a subject out to it as a new entry. */
export interface CopyToLibraryPanel {
  folder: LibraryFolder | undefined
  copy(assetId: number, kind: string): void
  copiedTo: string | null
  isCopying: boolean
  errorMessage: string | null
  reset(): void
}

/** Copies saved subjects out to the library folder, which is the one write the app makes there. */
export function useCopyToLibrary(): CopyToLibraryPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const folder = useQuery(trpc.library.entries.queryOptions())
  const copy = useMutation(
    trpc.library.copySubject.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.library.pathKey() }),
    })
  )

  return {
    folder: folder.data,
    copy: (assetId, kind) => copy.mutate({ assetId, kind }),
    copiedTo: copy.data?.path ?? null,
    isCopying: copy.isPending,
    // The message from main already says what the user can do about it.
    errorMessage: copy.error?.message ?? folder.error?.message ?? null,
    reset: copy.reset,
  }
}
