import { useState } from "react"
import type { Asset, LibraryEntry } from "@renderer/lib/trpc"
import { AddToProjectDialog } from "./add-to-project-dialog"
import { LibraryEntryPicker } from "./library-entry-picker"
import type { LibrarySubjectFields } from "./use-library"

interface AddFromLibraryDialogProps {
  /** Makes the saved subject from the entry picked, answering with it. */
  onCreate: (entryPath: string, fields: LibrarySubjectFields) => Promise<Asset>
  /** Takes the saved subject once it is made. */
  onCreated: (subject: Asset) => void
  onCancel: () => void
}

/**
 * Picks a library entry with a picture, asks what it is as a subject, and makes a saved subject
 * from it, as the library's own Use in project does.
 */
export function AddFromLibraryDialog({
  onCreate,
  onCreated,
  onCancel,
}: AddFromLibraryDialogProps): React.JSX.Element {
  const [entry, setEntry] = useState<LibraryEntry | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!entry) return <LibraryEntryPicker onPick={setEntry} onCancel={onCancel} />

  const create = async (fields: LibrarySubjectFields): Promise<void> => {
    setIsSaving(true)
    setErrorMessage(null)
    try {
      onCreated(await onCreate(entry.path, fields))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setIsSaving(false)
    }
  }

  return (
    <AddToProjectDialog
      entry={entry}
      isSaving={isSaving}
      errorMessage={errorMessage}
      onAdd={(fields) => void create(fields)}
      onCancel={onCancel}
    />
  )
}
