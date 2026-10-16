import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@renderer/design-system"
import { libraryFileUrl, type LibraryFile, type LibraryFolder } from "@renderer/lib/trpc"

interface LibraryImagePickerProps {
  folder: LibraryFolder | undefined
  onPick: (file: LibraryFile) => void
  onCancel: () => void
}

/** The library's pictures by kind and entry, to pick one from as a file picker would. */
export function LibraryImagePicker({
  folder,
  onPick,
  onCancel,
}: LibraryImagePickerProps): React.JSX.Element {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick a picture from the library</DialogTitle>
          <DialogDescription>
            The picture is sent from where it sits in the library, as one chosen from disk would be.
          </DialogDescription>
        </DialogHeader>
        <Pictures folder={folder} onPick={onPick} />
      </DialogContent>
    </Dialog>
  )
}

function Pictures({
  folder,
  onPick,
}: Omit<LibraryImagePickerProps, "onCancel">): React.JSX.Element {
  if (!folder) {
    return <p className="text-sm text-muted-foreground">Reading the library folder…</p>
  }
  if (folder.state === "unset") {
    return (
      <p className="text-sm text-muted-foreground">
        No library folder is set. Name one in settings and its pictures are offered here.
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

  const entries = folder.kinds
    .flatMap((kind) => kind.entries)
    .map((entry) => ({ entry, pictures: entry.files.filter((file) => file.media === "image") }))
    .filter(({ pictures }) => pictures.length > 0)
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">The library holds no pictures yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.map(({ entry, pictures }) => (
        <section key={entry.path} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {entry.name} <span className="text-xs text-muted-foreground">{entry.kind}</span>
          </h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
            {pictures.map((file) => (
              <li key={file.path}>
                <Button
                  variant="ghost"
                  className="flex h-auto w-full flex-col gap-1 p-1"
                  aria-label={`${entry.name}: ${file.name}`}
                  onClick={() => onPick(file)}
                >
                  <img
                    src={libraryFileUrl(file.relativePath, 160)}
                    alt=""
                    className="aspect-square w-full rounded border object-cover"
                  />
                  <span className="w-full truncate text-xs text-muted-foreground">{file.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
