import { useEffect, useState } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@renderer/design-system"
import { cutAtWord } from "@renderer/lib/cut-at-word"
import {
  libraryFileUrl,
  type LibraryEntry,
  type LibraryFile,
  type LibraryFolder,
} from "@renderer/lib/trpc"

/** The kinds of library file a slot can be filled from. */
export type PickableMedia = "image" | "audio" | "text"

/** How many characters of a text file the picker shows under its name. */
const PREVIEW_LENGTH = 150

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
    text: {
      title: "Pick a text from the library",
      description: "The file's text replaces what the field holds.",
      plural: "text files",
    },
  }

/** What the files of each media need to be shown: text files are read for their previews. */
type MediaProps =
  { media: "image" | "audio" } | { media: "text"; readText: (file: LibraryFile) => Promise<string> }

type FilesProps = MediaProps & {
  folder: LibraryFolder | undefined
  onPick: (file: LibraryFile) => void
}

type LibraryFilePickerProps = FilesProps & { onCancel: () => void }

/** The library's files of one media by kind and entry, to pick one from as a file picker would. */
export function LibraryFilePicker({
  onCancel,
  ...filesProps
}: LibraryFilePickerProps): React.JSX.Element {
  const words = PICKER_WORDS[filesProps.media]
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
        <Files {...filesProps} />
      </DialogContent>
    </Dialog>
  )
}

function Files(props: FilesProps): React.JSX.Element {
  const { media, folder, onPick } = props
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
          {props.media === "image" && <PictureGrid entry={entry} files={files} onPick={onPick} />}
          {props.media === "audio" && <SoundRows entry={entry} files={files} onPick={onPick} />}
          {props.media === "text" && (
            <TextRows entry={entry} files={files} onPick={onPick} readText={props.readText} />
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

/** An entry's text files as named rows, each with the start of its text to tell it by. */
function TextRows({
  entry,
  files,
  onPick,
  readText,
}: EntryFilesProps & { readText: (file: LibraryFile) => Promise<string> }): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-1">
      {files.map((file) => (
        <li key={file.path}>
          <Button
            variant="ghost"
            className="flex h-auto w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left"
            aria-label={`${entry.name}: ${file.name}`}
            onClick={() => onPick(file)}
          >
            <span className="w-full truncate">{file.name}</span>
            <TextPreview file={file} readText={readText} />
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** The start of a text file, on one run of lines, read when the row is shown. */
function TextPreview({
  file,
  readText,
}: {
  file: LibraryFile
  readText: (file: LibraryFile) => Promise<string>
}): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    let shown = true
    readText(file).then(
      (text) => shown && setPreview(previewOf(text)),
      () => shown && setPreview("This file could not be read.")
    )
    return () => {
      shown = false
    }
  }, [file, readText])

  return (
    <span className="w-full text-xs font-normal whitespace-normal text-muted-foreground">
      {preview ?? "Reading…"}
    </span>
  )
}

/** The start of a text with its whitespace run together, cut at a word. */
function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length === 0 ? "This file is empty." : cutAtWord(flat, PREVIEW_LENGTH)
}
