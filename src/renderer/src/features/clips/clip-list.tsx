import { Button } from "@renderer/design-system"
import type { ClipSummary } from "@renderer/lib/trpc"

/** What each form is called where there is only room for a few words. */
const FORM_NAMES: Record<string, string> = {
  t2v: "Text",
  i2v: "Image",
  fl2v: "First and last",
  l2v: "Last frame",
}

interface ClipListProps {
  clips: ClipSummary[]
  onCreate: () => void
  onPaste: () => void
  onOpen: (clipId: number) => void
  onBranch: (clipId: number) => void
  onRemove: (clip: ClipSummary) => void
}

/** What an empty tab shows: the project's clips, newest first, and the box that starts another. */
export function ClipList({
  clips,
  onCreate,
  onPaste,
  onOpen,
  onBranch,
  onRemove,
}: ClipListProps): React.JSX.Element {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl min-w-0 flex-col gap-6 overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Saved clips</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPaste}>
            Paste a prompt
          </Button>
          <Button onClick={onCreate} title="Ctrl and N">
            New clip
          </Button>
        </div>
      </div>

      {clips.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing saved yet. Start a clip, or paste a prompt to open one from it, and save it when
          it is worth coming back to.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {clips.map((clip) => (
            <li key={clip.id} className="flex items-center gap-1">
              <Button
                variant="ghost"
                className="h-auto flex-1 justify-start px-3 py-2 text-left"
                onClick={() => onOpen(clip.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{clip.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{summary(clip)}</span>
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Branch ${clip.name}`}
                onClick={() => onBranch(clip.id)}
              >
                Branch
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete ${clip.name}`}
                onClick={() => onRemove(clip)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** What a clip is, in one line: how it is written, how many shots, how long. */
function summary(clip: ClipSummary): string {
  const shots = `${clip.shots} ${clip.shots === 1 ? "shot" : "shots"}`
  return [
    FORM_NAMES[clip.form] ?? clip.form,
    shots,
    `${(clip.durationMs / 1000).toFixed(1)}s`,
  ].join(" · ")
}
