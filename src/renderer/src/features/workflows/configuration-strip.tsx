import { Ellipsis } from "lucide-react"
import { useId, useRef, useState } from "react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@renderer/design-system"
import type { Configuration } from "@renderer/lib/trpc"

interface ConfigurationStripProps {
  configurations: Configuration[]
  /** The configuration the form was last filled from. */
  loadedId: number | null
  onLoad: (configurationId: number) => void
  onRename: (configurationId: number, name: string) => void
  onDuplicate: (configurationId: number) => void
  onDelete: (configurationId: number) => void
}

/** A workflow's configurations, each a slim row that loads into the form. */
export function ConfigurationStrip({
  configurations,
  loadedId,
  onLoad,
  onRename,
  onDuplicate,
  onDelete,
}: ConfigurationStripProps): React.JSX.Element {
  if (configurations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing saved yet. Save the form&apos;s values as a configuration to queue them again later.
      </p>
    )
  }
  return (
    <ul className="flex flex-col">
      {configurations.map((configuration) => (
        <ConfigurationRow
          key={configuration.id}
          configuration={configuration}
          loaded={configuration.id === loadedId}
          onLoad={() => onLoad(configuration.id)}
          onRename={(name) => onRename(configuration.id, name)}
          onDuplicate={() => onDuplicate(configuration.id)}
          onDelete={() => onDelete(configuration.id)}
        />
      ))}
    </ul>
  )
}

interface ConfigurationRowProps {
  configuration: Configuration
  loaded: boolean
  onLoad: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
}

/** What a row shows besides its name: nothing extra, a name being edited, or a delete to confirm. */
type RowMode = "showing" | "renaming" | "confirming-delete"

/** One configuration: its name, when it last changed, whether slots have gone, and its actions. */
function ConfigurationRow({
  configuration,
  loaded,
  onLoad,
  onRename,
  onDuplicate,
  onDelete,
}: ConfigurationRowProps): React.JSX.Element {
  const [mode, setMode] = useState<RowMode>("showing")
  const renameId = useId()
  // The menu hands focus back to its trigger as it closes, which would end a rename at once.
  const focusRename = useRef(false)
  const stale = configuration.staleSlotNames

  return (
    <li
      aria-label={configuration.name}
      className="flex flex-wrap items-center gap-3 border-b py-1.5 text-sm last:border-b-0"
    >
      {mode === "renaming" ? (
        <RenameField
          id={renameId}
          name={configuration.name}
          onDone={(name) => {
            if (name !== null && name !== configuration.name) onRename(name)
            setMode("showing")
          }}
        />
      ) : (
        <span className="min-w-0 truncate font-medium">{configuration.name}</span>
      )}
      {loaded && <span className="text-xs text-muted-foreground">loaded</span>}
      <time dateTime={configuration.updatedAt} className="text-muted-foreground">
        {changedAt(configuration.updatedAt)}
      </time>
      {stale.length > 0 && (
        <span className="text-xs text-destructive">
          No longer in the workflow: {stale.join(", ")}
        </span>
      )}
      {mode === "confirming-delete" ? (
        <span className="ml-auto flex items-center gap-2">
          <span>Delete {configuration.name}?</span>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("showing")}>
            Keep
          </Button>
        </span>
      ) : (
        <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onLoad}>
            Load
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" aria-label={`More for ${configuration.name}`}>
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                if (!focusRename.current) return
                focusRename.current = false
                event.preventDefault()
                document.getElementById(renameId)?.focus()
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  focusRename.current = true
                  setMode("renaming")
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setMode("confirming-delete")}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
    </li>
  )
}

/** The name in an input, given back once on Enter or on leaving it, and nothing on Escape. */
function RenameField({
  id,
  name,
  onDone,
}: {
  id: string
  name: string
  onDone: (name: string | null) => void
}): React.JSX.Element {
  const [text, setText] = useState(name)
  const done = useRef(false)
  const finish = (result: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(result)
  }
  const typed = (): string | null => (text.trim().length > 0 ? text.trim() : null)
  return (
    <Input
      id={id}
      aria-label={`New name for ${name}`}
      className="h-8 max-w-64"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => finish(typed())}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(typed())
        if (event.key === "Escape") finish(null)
      }}
    />
  )
}

/** When a configuration last changed, as a day and a time. */
function changedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
