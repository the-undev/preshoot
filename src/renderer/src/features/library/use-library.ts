import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useTRPC,
  useTRPCClient,
  type AssetKind,
  type LibraryFile,
  type LibraryFolder,
} from "@renderer/lib/trpc"

/** The library folder as it is now, and the calls that copy from it into the project. */
export interface LibraryPanel {
  folder: LibraryFolder | undefined
  refresh(): void
  addToProject(
    entryPath: string,
    fields: { kind: AssetKind; description: string },
    onAdded: (name: string) => void
  ): void
  openAsClip(file: LibraryFile, onOpened: () => void): void
  isWorking: boolean
  addError: string | null
  errorMessage: string | null
}

/** Reads the library folder, again each time it is shown, and copies entries into the project. */
export function useLibrary(): LibraryPanel {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const queryClient = useQueryClient()
  const folder = useQuery(trpc.library.entries.queryOptions())

  const add = useMutation(
    trpc.library.addToProject.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.assets.pathKey() }),
    })
  )

  // The text is read, then goes through the same paste a prompt typed in does, then gets a tab.
  const open = useMutation({
    mutationFn: async (file: LibraryFile) => {
      const { text } = await client.library.readText.query({ relativePath: file.relativePath })
      if (text.trim().length === 0) {
        throw new Error(`${file.name} is empty, so there is nothing to open.`)
      }
      const clip = await client.clips.paste.mutate({ text })
      return client.tabs.openClip.mutate({ clipId: clip.id })
    },
    onSuccess: async (workspace) => {
      queryClient.setQueryData(trpc.tabs.list.queryKey(), workspace)
      await queryClient.invalidateQueries({ queryKey: trpc.clips.pathKey() })
    },
  })

  return {
    folder: folder.data,
    refresh: () => void folder.refetch(),
    addToProject: (entryPath, fields, onAdded) =>
      add.mutate({ entryPath, ...fields }, { onSuccess: (subject) => onAdded(subject.name) }),
    openAsClip: (file, onOpened) => open.mutate(file, { onSuccess: onOpened }),
    isWorking: add.isPending || open.isPending,
    // The message from main already says what the user can do about it.
    addError: add.error?.message ?? null,
    errorMessage: open.error?.message ?? folder.error?.message ?? null,
  }
}
