import { Plus, X } from "lucide-react"
import { Button } from "@renderer/design-system"
import type { OpenTab } from "@renderer/lib/trpc"
import { tabTitle } from "./tab-title"

interface TabBarProps {
  tabs: OpenTab[]
  activeId: number | null
  onActivate: (tabId: number) => void
  onClose: (tabId: number) => void
  onOpenEmpty: () => void
}

/** The open tabs, left to right, with the button that opens another. */
export function TabBar({
  tabs,
  activeId,
  onActivate,
  onClose,
  onOpenEmpty,
}: TabBarProps): React.JSX.Element {
  return (
    <div role="tablist" aria-label="Open tabs" className="flex min-w-0 items-center gap-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const name = tabTitle(tab)
          const chosen = tab.id === activeId
          return (
            <div
              key={tab.id}
              className={`flex min-w-0 shrink-0 items-center rounded-t border-b-2 ${
                chosen ? "border-primary bg-accent" : "border-transparent hover:bg-accent/50"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={chosen}
                className="flex max-w-48 min-w-0 items-center gap-1.5 px-3 py-1.5 text-left text-sm"
                onClick={() => onActivate(tab.id)}
              >
                {/* A clip with no name has never been saved, which its tab says with a dot. */}
                {tab.clipId !== null && tab.clipName === null && (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
                  />
                )}
                <span className="min-w-0 truncate">{name}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 size-5"
                aria-label={`Close ${name}`}
                onClick={() => onClose(tab.id)}
              >
                <X className="size-3" />
              </Button>
            </div>
          )
        })}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label="New tab"
        title="New tab"
        onClick={onOpenEmpty}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
