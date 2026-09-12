import { useState } from "react"
import { Button, Input } from "@renderer/design-system"
import type { ClipSummary } from "@renderer/lib/trpc"

interface ClipListProps {
  clips: ClipSummary[]
  selectedId: number | null
  onSelect: (id: number) => void
  onCreate: (name: string) => void
}

/** The project's clips, newest first, with the box that starts another. */
export function ClipList({
  clips,
  selectedId,
  onSelect,
  onCreate,
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
            <li key={clip.id}>
              <Button
                variant={clip.id === selectedId ? "secondary" : "ghost"}
                className="h-auto w-full justify-start px-3 py-2 text-left"
                onClick={() => onSelect(clip.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{clip.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{clip.style}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
