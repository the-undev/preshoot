import { useState } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@renderer/design-system"
import type { AssetKind, LibraryEntry } from "@renderer/lib/trpc"

/** What a subject can be. The router accepts these and nothing else. */
const SUBJECT_KINDS: AssetKind[] = ["person", "place", "object"]

interface AddToProjectDialogProps {
  entry: LibraryEntry
  isSaving: boolean
  errorMessage: string | null
  onAdd: (fields: { kind: AssetKind; description: string }) => void
  onCancel: () => void
}

/**
 * Asks what a library entry is as a subject before copying it into the project, starting the
 * description from its notes. The subject is named after the entry.
 */
export function AddToProjectDialog({
  entry,
  isSaving,
  errorMessage,
  onAdd,
  onCancel,
}: AddToProjectDialogProps): React.JSX.Element {
  const [kind, setKind] = useState<AssetKind>("person")
  const [description, setDescription] = useState(entry.notes ?? "")
  const trimmed = description.trim()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed.length > 0) onAdd({ kind, description: trimmed })
          }}
        >
          <DialogHeader>
            <DialogTitle>Use {entry.name} in this project</DialogTitle>
            <DialogDescription>
              It becomes a saved subject called {entry.name}, and the entry&apos;s pictures are
              copied into the project. The library entry stays as it is.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Kind</span>
            <div className="flex gap-2" role="group" aria-label="Kind">
              {SUBJECT_KINDS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={option === kind ? "secondary" : "outline"}
                  aria-pressed={option === kind}
                  onClick={() => setKind(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="library-subject-description">Description</Label>
            <Textarea
              id="library-subject-description"
              className="min-h-28"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || trimmed.length === 0}>
              Use in project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
