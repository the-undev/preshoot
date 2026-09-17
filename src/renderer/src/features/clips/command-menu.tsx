import { useState } from "react"
import { Input } from "@renderer/design-system"

/** One thing the menu can do, which is either a command or an insert. */
export interface Command {
  id: string
  /** What it is called in the list, which is also what the box filters on. */
  label: string
  /** The heading it sits under, so a long list still reads as a few short ones. */
  group: string
  run: () => void
}

/** The commands whose label holds `typed`, in the order they were given. */
function matching(commands: Command[], typed: string): Command[] {
  const wanted = typed.trim().toLowerCase()
  if (wanted.length === 0) return commands
  return commands.filter((command) => command.label.toLowerCase().includes(wanted))
}

/** The commands of each group, in the order they were given. */
function grouped(commands: Command[]): { group: string; commands: Command[] }[] {
  const groups: { group: string; commands: Command[] }[] = []
  for (const command of commands) {
    const found = groups.find((entry) => entry.group === command.group)
    if (found) {
      found.commands.push(command)
      continue
    }
    groups.push({ group: command.group, commands: [command] })
  }
  return groups
}

interface CommandMenuProps {
  commands: Command[]
  onClose: () => void
}

/**
 * Everything that can be done from where the cursor is, filtered as it is typed. Opened by the
 * command menu shortcut, or by a slash on a line with nothing on it yet.
 */
export function CommandMenu({ commands, onClose }: CommandMenuProps): React.JSX.Element {
  const [typed, setTyped] = useState("")
  const [at, setAt] = useState(0)
  const shown = matching(commands, typed)
  // The list shortens as it is filtered, so the highlight lands inside whatever is left of it.
  const highlighted = Math.min(at, Math.max(shown.length - 1, 0))

  const run = (command: Command | undefined): void => {
    if (!command) return
    command.run()
    onClose()
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        autoFocus
        aria-label="What to do"
        placeholder="Type to narrow"
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value)
          setAt(0)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setAt(Math.min(highlighted + 1, shown.length - 1))
            return
          }
          if (event.key === "ArrowUp") {
            event.preventDefault()
            setAt(Math.max(highlighted - 1, 0))
            return
          }
          if (event.key === "Enter") {
            event.preventDefault()
            run(shown[highlighted])
          }
        }}
      />

      {shown.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">Nothing goes by that name.</p>
      ) : (
        <div
          role="listbox"
          aria-label="Commands"
          className="flex max-h-72 flex-col overflow-y-auto"
        >
          {grouped(shown).map((entry) => (
            <div key={entry.group} className="flex flex-col">
              <span className="px-2 pt-2 pb-0.5 text-xs text-muted-foreground">{entry.group}</span>
              {entry.commands.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={command === shown[highlighted]}
                  className={`rounded px-2 py-1 text-left text-sm hover:bg-accent ${
                    command === shown[highlighted] ? "bg-accent" : ""
                  }`}
                  onClick={() => run(command)}
                >
                  {command.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
