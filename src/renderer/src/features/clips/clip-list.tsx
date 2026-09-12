import { useState } from "react"
import { Button, Input } from "@renderer/design-system"
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
  selectedId: number | null
  onSelect: (id: number) => void
  onCreate: (name: string) => void
  onRemove: (clip: ClipSummary) => void
}

/** The project's clips, newest first, with the box that starts another. */
export function ClipList({
  clips,
  selectedId,
  onSelect,
  onCreate,
  onRemove,
}: ClipListProps): React.JSX.Element {
  const [name, setName] = useState("")
  const trimmedName = name.trim()

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmedName.length === 0) return
          onCreate(trimmedName)
          setName("")
        }}
      >
        <Input
          aria-label="New clip name"
          placeholder="New clip"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={trimmedName.length === 0}>
          Add
        </Button>
      </form>

      {clips.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clips in this project yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {clips.map((clip) => (
            <li key={clip.id} className="flex items-center gap-1">
              <Button
                variant={clip.id === selectedId ? "secondary" : "ghost"}
                className="h-auto flex-1 justify-start px-3 py-2 text-left"
                onClick={() => onSelect(clip.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{clip.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{summary(clip)}</span>
                </span>
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
