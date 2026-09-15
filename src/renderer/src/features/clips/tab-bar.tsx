import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react"
import { Button } from "@renderer/design-system"
import type { OpenTab } from "@renderer/lib/trpc"
import { tabTitle } from "./tab-title"

interface TabBarProps {
  tabs: OpenTab[]
  activeId: number | null
  onActivate: (tabId: number) => void
  onClose: (tabId: number) => void
  onMove: (tabId: number, toPosition: number) => void
  onOpenEmpty: () => void
}

/** The open tabs, left to right, with the button that opens another. */
export function TabBar({
  tabs,
  activeId,
  onActivate,
  onClose,
  onMove,
  onOpenEmpty,
}: TabBarProps): React.JSX.Element {
  const strip = useRef<HTMLDivElement>(null)
  // Whether the strip is wider than the room for it, so the arrows only appear when they do something.
  const [scrolls, setScrolls] = useState(false)

  useEffect(() => {
    const element = strip.current
    if (!element) return
    const measure = (): void => setScrolls(element.scrollWidth > element.clientWidth + 1)
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [tabs])

  const scroll = (by: number): void => strip.current?.scrollBy({ left: by, behavior: "smooth" })

  return (
    <div role="tablist" aria-label="Open tabs" className="flex min-w-0 items-center gap-1">
      {scrolls && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="Scroll the tabs left"
          onClick={() => scroll(-240)}
        >
          <ChevronLeft className="size-4" />
        </Button>
      )}

      <div
        ref={strip}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-smooth"
      >
        {tabs.map((tab) => {
          const name = tabTitle(tab)
          const chosen = tab.id === activeId
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/plain", String(tab.id))}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const moved = Number(event.dataTransfer.getData("text/plain"))
                if (Number.isInteger(moved) && moved !== tab.id) {
                  onMove(
                    moved,
                    tabs.findIndex((entry) => entry.id === tab.id)
                  )
                }
              }}
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

      {scrolls && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="Scroll the tabs right"
          onClick={() => scroll(240)}
        >
          <ChevronRight className="size-4" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label="New tab"
        title="New tab (Ctrl T)"
        onClick={onOpenEmpty}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
