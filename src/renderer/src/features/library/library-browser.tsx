import { FileText, RefreshCw } from "lucide-react"
import { useState } from "react"
import { Button } from "@renderer/design-system"
import {
  libraryFileUrl,
  type LibraryEntry,
  type LibraryFile,
  type LibraryFolder,
} from "@renderer/lib/trpc"
import { MEDIA_LABELS } from "./media-labels"

interface LibraryBrowserProps {
  folder: LibraryFolder | undefined
  isWorking: boolean
  onRefresh: () => void
  onOpenSettings: () => void
  onAddToProject: (entry: LibraryEntry) => void
  onOpenAsClip: (file: LibraryFile) => void
}

/**
 * The library folder: its kinds across the top, the entries of the chosen kind, and the chosen
 * entry beside them. Nothing here changes the folder.
 */
export function LibraryBrowser({
  folder,
  isWorking,
  onRefresh,
  onOpenSettings,
  onAddToProject,
  onOpenAsClip,
}: LibraryBrowserProps): React.JSX.Element {
  const [chosenKind, setChosenKind] = useState<string | null>(null)
  const [chosenEntry, setChosenEntry] = useState<string | null>(null)

  const header = (
    <div className="flex items-center justify-between gap-4">
      <h2 className="font-heading text-sm font-semibold text-muted-foreground">Library</h2>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Read the library folder again"
        onClick={onRefresh}
      >
        <RefreshCw className="size-4" />
      </Button>
    </div>
  )

  if (!folder || folder.state !== "listed") {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {header}
        <FolderState folder={folder} onOpenSettings={onOpenSettings} />
      </div>
    )
  }

  if (folder.kinds.length === 0) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {header}
        <p className="text-sm text-muted-foreground">
          <span className="break-all">{folder.folder}</span> has no folders in it yet. Each folder
          at the top of it is a kind, such as characters or scenes, and each folder inside a kind is
          an entry.
        </p>
      </div>
    )
  }

  // A kind or entry that went from the folder since it was chosen falls back to the first.
  const kind = folder.kinds.find((candidate) => candidate.name === chosenKind) ?? folder.kinds[0]
  const entry = kind.entries.find((candidate) => candidate.path === chosenEntry) ?? null

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="flex min-w-0 flex-col gap-4">
        {header}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kinds">
          {folder.kinds.map((candidate) => (
            <Button
              key={candidate.name}
              variant={candidate.name === kind.name ? "secondary" : "outline"}
              size="sm"
              aria-pressed={candidate.name === kind.name}
              onClick={() => {
                setChosenKind(candidate.name)
                setChosenEntry(null)
              }}
            >
              {candidate.name}
              <span className="text-xs text-muted-foreground">{candidate.entries.length}</span>
            </Button>
          ))}
        </div>

        {kind.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in {kind.name} yet.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {kind.entries.map((candidate) => (
              <li key={candidate.path}>
                <EntryCard
                  entry={candidate}
                  selected={candidate.path === entry?.path}
                  onOpen={() => setChosenEntry(candidate.path)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {entry ? (
        <EntryView
          entry={entry}
          isWorking={isWorking}
          onAddToProject={() => onAddToProject(entry)}
          onOpenAsClip={onOpenAsClip}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Open an entry to see its pictures, files and notes.
        </p>
      )}
    </div>
  )
}

interface FolderStateProps {
  folder: LibraryFolder | undefined
  onOpenSettings: () => void
}

/** Why there is nothing to show yet: still reading, no folder named, or the folder gone. */
function FolderState({ folder, onOpenSettings }: FolderStateProps): React.JSX.Element {
  if (!folder) {
    return <p className="text-sm text-muted-foreground">Reading the library folder…</p>
  }
  return (
    <div className="flex flex-col items-start gap-2">
      {folder.state === "missing" ? (
        <p className="text-sm text-muted-foreground">
          The library folder is not there: <span className="break-all">{folder.folder}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No library folder is set. The library is a folder of your own: a folder per kind, such as
          characters, scenes or prompts, and a folder per entry inside each, holding its pictures
          and files and an entry.md for its notes. Name it in settings and it is listed here. Using
          an entry copies it into the project.
        </p>
      )}
      <Button variant="outline" size="sm" onClick={onOpenSettings}>
        Open settings
      </Button>
    </div>
  )
}

interface EntryCardProps {
  entry: LibraryEntry
  selected: boolean
  onOpen: () => void
}

/** One entry in the list: its first picture when it has one, its name and what it holds. */
function EntryCard({ entry, selected, onOpen }: EntryCardProps): React.JSX.Element {
  const picture = entry.files.find((file) => file.media === "image")

  return (
    <Button
      variant={selected ? "secondary" : "ghost"}
      className="flex h-auto w-full flex-col items-stretch gap-2 rounded-lg border p-2 text-left"
      aria-current={selected ? "true" : undefined}
      onClick={onOpen}
    >
      {picture ? (
        <img
          src={libraryFileUrl(picture.relativePath, 320)}
          alt=""
          className="aspect-square w-full rounded object-cover"
        />
      ) : (
        <span className="flex aspect-square w-full items-center justify-center rounded bg-muted">
          <FileText className="size-6 text-muted-foreground" />
        </span>
      )}
      <span className="truncate text-sm font-medium">{entry.name}</span>
    </Button>
  )
}

interface EntryViewProps {
  entry: LibraryEntry
  isWorking: boolean
  onAddToProject: () => void
  onOpenAsClip: (file: LibraryFile) => void
}

/** One entry: its notes, its pictures as a grid, and its other files as rows. */
function EntryView({
  entry,
  isWorking,
  onAddToProject,
  onOpenAsClip,
}: EntryViewProps): React.JSX.Element {
  const pictures = entry.files.filter((file) => file.media === "image")
  const others = entry.files.filter((file) => file.media !== "image")

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={entry.name}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <h2 className="font-heading text-lg font-semibold">{entry.name}</h2>
          <p className="text-xs text-muted-foreground">{entry.kind}</p>
        </div>
        <Button size="sm" disabled={isWorking} onClick={onAddToProject}>
          Use in project
        </Button>
      </div>

      {entry.notes === null ? (
        <p className="text-sm text-muted-foreground">
          No notes. An entry.md in its folder is shown here.
        </p>
      ) : (
        <p className="max-w-prose text-sm whitespace-pre-wrap">{entry.notes}</p>
      )}

      {pictures.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
          {pictures.map((file) => (
            <li key={file.path} className="flex flex-col gap-1">
              <img
                src={libraryFileUrl(file.relativePath, 320)}
                alt={file.name}
                className="aspect-square w-full rounded border object-cover"
              />
              <span className="truncate text-xs text-muted-foreground">{file.name}</span>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <ul className="flex flex-col">
          {others.map((file) => (
            <li key={file.path} className="flex items-center gap-3 border-b py-1.5 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {MEDIA_LABELS[file.media]}
              </span>
              {file.media === "text" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isWorking}
                  aria-label={`Open ${file.name} as a clip`}
                  onClick={() => onOpenAsClip(file)}
                >
                  Open as clip
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
