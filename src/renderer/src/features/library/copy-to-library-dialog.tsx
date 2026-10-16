import { useState } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@renderer/design-system"
import type { LibraryFolder } from "@renderer/lib/trpc"

interface CopyToLibraryDialogProps {
  subjectName: string
  folder: LibraryFolder | undefined
  isCopying: boolean
  errorMessage: string | null
  /** Where the new entry was written, once it has been. */
  copiedTo: string | null
  onCopy: (kind: string) => void
  onClose: () => void
}

/**
 * Asks which kind a subject goes under before copying it out to the library as a new entry,
 * offering the kinds the folder already has and taking a new one typed in.
 */
export function CopyToLibraryDialog({
  subjectName,
  folder,
  isCopying,
  errorMessage,
  copiedTo,
  onCopy,
  onClose,
}: CopyToLibraryDialogProps): React.JSX.Element {
  const [kind, setKind] = useState("")
  const trimmed = kind.trim()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed.length > 0) onCopy(trimmed)
          }}
        >
          <DialogHeader>
            <DialogTitle>Copy {subjectName} to the library</DialogTitle>
            <DialogDescription>
              A new entry folder called {subjectName} is written under the kind chosen, holding the
              pictures and an entry.md with the description. An entry already there of that name is
              left alone.
            </DialogDescription>
          </DialogHeader>

          {copiedTo ? (
            <p className="text-sm">
              {subjectName} is in the library at <span className="break-all">{copiedTo}</span>.
            </p>
          ) : (
            <KindField folder={folder} kind={kind} onChange={setKind} />
          )}

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

          <DialogFooter>
            {copiedTo ? (
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCopying || trimmed.length === 0 || folder?.state !== "listed"}
                >
                  Copy
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface KindFieldProps {
  folder: LibraryFolder | undefined
  kind: string
  onChange: (kind: string) => void
}

/** The kind to copy under: one of the folder's, or a new name, which makes a new kind folder. */
function KindField({ folder, kind, onChange }: KindFieldProps): React.JSX.Element {
  if (!folder) {
    return <p className="text-sm text-muted-foreground">Reading the library folder…</p>
  }
  if (folder.state === "unset") {
    return (
      <p className="text-sm text-muted-foreground">
        No library folder is set. Name one in settings first.
      </p>
    )
  }
  if (folder.state === "missing") {
    return (
      <p className="text-sm text-muted-foreground">
        The library folder is not there: <span className="break-all">{folder.folder}</span>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="copy-to-library-kind">Kind</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Kinds in the library">
        {folder.kinds.map((candidate) => (
          <Button
            key={candidate.name}
            type="button"
            size="sm"
            variant={candidate.name === kind.trim() ? "secondary" : "outline"}
            aria-pressed={candidate.name === kind.trim()}
            onClick={() => onChange(candidate.name)}
          >
            {candidate.name}
          </Button>
        ))}
      </div>
      <Input
        id="copy-to-library-kind"
        value={kind}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Pick a kind, or type a new name and a folder of that name is made for it.
      </p>
    </div>
  )
}
