import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Alert, AlertDescription } from "@renderer/design-system"
import { AddToProjectDialog } from "@renderer/features/library/add-to-project-dialog"
import { LibraryBrowser } from "@renderer/features/library/library-browser"
import { useLibrary } from "@renderer/features/library/use-library"
import { useOpenSettings } from "@renderer/features/settings/settings-dialog-context"
import type { LibraryEntry } from "@renderer/lib/trpc"
import { useRereadFoldersOnFocus } from "@renderer/lib/use-reread-folders-on-focus"

export const Route = createFileRoute("/project/library")({
  component: Library,
})

/**
 * The user's library folder, read each time it is shown or the window gains focus, and the copies
 * made from it.
 */
function Library(): React.JSX.Element {
  const library = useLibrary()
  useRereadFoldersOnFocus()
  const openSettings = useOpenSettings()
  const navigate = useNavigate()
  const [adding, setAdding] = useState<LibraryEntry | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  return (
    <main className="mx-auto flex h-full w-full max-w-[1920px] flex-col gap-4 overflow-y-auto p-8">
      {library.errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{library.errorMessage}</AlertDescription>
        </Alert>
      )}
      {added && (
        <Alert>
          <AlertDescription>
            {added} is saved in this project, under Saved, ready to use in a clip.
          </AlertDescription>
        </Alert>
      )}

      <LibraryBrowser
        folder={library.folder}
        isWorking={library.isWorking}
        onRefresh={library.refresh}
        onOpenSettings={openSettings}
        onAddToProject={(entry) => {
          setAdded(null)
          setAdding(entry)
        }}
        onOpenAsClip={(file) => library.openAsClip(file, () => void navigate({ to: "/project" }))}
        onOpenFile={library.openFile}
      />

      {adding && (
        <AddToProjectDialog
          entry={adding}
          isSaving={library.isWorking}
          errorMessage={library.addError}
          onAdd={(fields) =>
            library.addToProject(adding.path, fields, (name) => {
              setAdding(null)
              setAdded(name)
            })
          }
          onCancel={() => setAdding(null)}
        />
      )}
    </main>
  )
}
