import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@renderer/design-system"
import {
  libraryFileUrl,
  type LibraryEntry,
  type LibraryFile,
  type LibraryFolder,
} from "@renderer/lib/trpc"

/** The kinds of library file a slot can be filled from. */
export type PickableMedia = "image" | "audio"

/** How the picker speaks of the files it offers, by what they hold. */
const PICKER_WORDS: Record<PickableMedia, { title: string; description: string; plural: string }> =
  {
    image: {
      title: "Pick a picture from the library",
      description:
        "The picture is sent from where it sits in the library, as one chosen from disk would be.",
      plural: "pictures",
    },
    audio: {
      title: "Pick a sound from the library",
      description:
        "The sound is sent from where it sits in the library, as one chosen from disk would be.",
      plural: "sounds",
    },
  }

interface LibraryFilePickerProps {
  media: PickableMedia
  folder: LibraryFolder | undefined
  onPick: (file: LibraryFile) => void
  onCancel: () => void
}

/** The library's files of one media by kind and entry, to pick one from as a file picker would. */
export function LibraryFilePicker({
  media,
  folder,
  onPick,
  onCancel,
}: LibraryFilePickerProps): React.JSX.Element {
  const words = PICKER_WORDS[media]
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{words.title}</DialogTitle>
          <DialogDescription>{words.description}</DialogDescription>
        </DialogHeader>
        <Files media={media} folder={folder} onPick={onPick} />
      </DialogContent>
    </Dialog>
  )
}

function Files({
  media,
  folder,
  onPick,
}: Omit<LibraryFilePickerProps, "onCancel">): React.JSX.Element {
  const plural = PICKER_WORDS[media].plural
  if (!folder) {
    return <p className="text-sm text-muted-foreground">Reading the library folder…</p>
  }
  if (folder.state === "unset") {
    return (
      <p className="text-sm text-muted-foreground">
        No library folder is set. Name one in settings and its {plural} are offered here.
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
    .map((entry) => ({ entry, files: entry.files.filter((file) => file.media === media) }))
    .filter(({ files }) => files.length > 0)
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">The library holds no {plural} yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.map(({ entry, files }) => (
        <section key={entry.path} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {entry.name} <span className="text-xs text-muted-foreground">{entry.kind}</span>
          </h3>
          {media === "image" ? (
            <PictureGrid entry={entry} files={files} onPick={onPick} />
          ) : (
            <SoundRows entry={entry} files={files} onPick={onPick} />
          )}
        </section>
      ))}
    </div>
  )
}

interface EntryFilesProps {
  entry: LibraryEntry
  files: LibraryFile[]
  onPick: (file: LibraryFile) => void
}

/** An entry's pictures as thumbnails. */
function PictureGrid({ entry, files, onPick }: EntryFilesProps): React.JSX.Element {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
      {files.map((file) => (
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
  )
}

/** An entry's sounds as named rows, each with a player to hear it before picking it. */
function SoundRows({ entry, files, onPick }: EntryFilesProps): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-1">
      {files.map((file) => (
        <li key={file.path} className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 justify-start"
            aria-label={`${entry.name}: ${file.name}`}
            onClick={() => onPick(file)}
          >
            <span className="truncate">{file.name}</span>
          </Button>
          <audio
            controls
            preload="none"
            src={libraryFileUrl(file.relativePath)}
            aria-label={`Play ${file.name}`}
            className="ml-auto h-8 shrink-0"
          />
        </li>
      ))}
    </ul>
  )
}
