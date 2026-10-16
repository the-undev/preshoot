import { useQuery } from "@tanstack/react-query"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@renderer/design-system"
import { libraryFileUrl, useTRPC, type LibraryEntry, type LibraryFolder } from "@renderer/lib/trpc"
import { FolderNotice } from "./library-file-picker"

/** What the picker offers, as its notices name it. */
const OFFERED = "entries with pictures"

interface LibraryEntryPickerProps {
  onPick: (entry: LibraryEntry) => void
  onCancel: () => void
}

/**
 * The library's entries that hold a picture, each shown by its first one, to pick one from. The
 * library folder is read when the picker opens.
 */
export function LibraryEntryPicker({
  onPick,
  onCancel,
}: LibraryEntryPickerProps): React.JSX.Element {
  const trpc = useTRPC()
  const folder = useQuery(trpc.library.entries.queryOptions()).data
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick an entry from the library</DialogTitle>
          <DialogDescription>
            Each entry with a picture is offered. The next step asks what it is as a subject.
          </DialogDescription>
        </DialogHeader>
        <Entries folder={folder} onPick={onPick} />
      </DialogContent>
    </Dialog>
  )
}

function Entries({
  folder,
  onPick,
}: {
  folder: LibraryFolder | undefined
  onPick: (entry: LibraryEntry) => void
}): React.JSX.Element {
  if (!folder || folder.state !== "listed") return <FolderNotice folder={folder} plural={OFFERED} />

  const pictured = folder.kinds
    .flatMap((kind) => kind.entries)
    .flatMap((entry) => {
      const picture = entry.files.find((file) => file.media === "image")
      return picture ? [{ entry, picture }] : []
    })
  if (pictured.length === 0) {
    return <p className="text-sm text-muted-foreground">The library holds no {OFFERED} yet.</p>
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
      {pictured.map(({ entry, picture }) => (
        <li key={entry.path}>
          <Button
            variant="ghost"
            className="flex h-auto w-full flex-col gap-1 p-1"
            aria-label={entry.name}
            onClick={() => onPick(entry)}
          >
            <img
              src={libraryFileUrl(picture.relativePath, 160)}
              alt=""
              className="aspect-square w-full rounded border object-cover"
            />
            <span className="w-full truncate text-sm">{entry.name}</span>
            <span className="w-full truncate text-xs text-muted-foreground">{entry.kind}</span>
          </Button>
        </li>
      ))}
    </ul>
  )
}
