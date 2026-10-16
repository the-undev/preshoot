import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useTRPC,
  useTRPCClient,
  type Asset,
  type AssetKind,
  type LibraryFile,
  type LibraryFolder,
} from "@renderer/lib/trpc"

/** What a library entry is asked before it becomes a saved subject. */
export interface LibrarySubjectFields {
  kind: AssetKind
  description: string
}

/** The library folder as it is now, and the calls that copy from it into the project. */
export interface LibraryPanel {
  folder: LibraryFolder | undefined
  refresh(): void
  addToProject(
    entryPath: string,
    fields: LibrarySubjectFields,
    onAdded: (name: string) => void
  ): void
  openAsClip(file: LibraryFile, onOpened: () => void): void
  /** Opens a picture in the app the system gives pictures. */
  openFile(file: LibraryFile): void
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

  const add = useAddToProject()
  const openFile = useMutation(trpc.library.openFile.mutationOptions())

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
    // A refusal is shown through addError, so it is not handed on as well.
    addToProject: (entryPath, fields, onAdded) =>
      void add.add(entryPath, fields).then(
        (subject) => onAdded(subject.name),
        () => {}
      ),
    openAsClip: (file, onOpened) => open.mutate(file, { onSuccess: onOpened }),
    openFile: (file) => openFile.mutate({ relativePath: file.relativePath }),
    isWorking: add.isAdding || open.isPending,
    addError: add.errorMessage,
    errorMessage: open.error?.message ?? openFile.error?.message ?? folder.error?.message ?? null,
  }
}

/** The call that makes a saved subject from a library entry, and how it stands. */
export interface AddToProjectCall {
  /** Makes the subject and answers with it. A refusal rejects, and its message stays below. */
  add(entryPath: string, fields: LibrarySubjectFields): Promise<Asset>
  isAdding: boolean
  errorMessage: string | null
}

/** Makes a saved subject in the open project from a library entry, then reads the saved ones again. */
export function useAddToProject(): AddToProjectCall {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const add = useMutation(
    trpc.library.addToProject.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.assets.pathKey() }),
    })
  )
  return {
    add: (entryPath, fields) => add.mutateAsync({ entryPath, ...fields }),
    isAdding: add.isPending,
    // The message from main already says what the user can do about it.
    errorMessage: add.error?.message ?? null,
  }
}
