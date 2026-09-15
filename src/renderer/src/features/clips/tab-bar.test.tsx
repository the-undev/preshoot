import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { OpenTab } from "@renderer/lib/trpc"
import { TabBar } from "./tab-bar"

const tabs: OpenTab[] = [
  { id: 1, clipId: null, clipName: null, firstBeat: null, savedFrom: null },
  { id: 2, clipId: 7, clipName: "Lighthouse", firstBeat: null, savedFrom: null },
]

function renderBar(over: Partial<React.ComponentProps<typeof TabBar>> = {}): {
  onActivate: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  onOpenEmpty: ReturnType<typeof vi.fn>
} {
  const onActivate = vi.fn()
  const onClose = vi.fn()
  const onOpenEmpty = vi.fn()
  render(
    <TabBar
      tabs={tabs}
      activeId={2}
      onActivate={onActivate}
      onClose={onClose}
      onOpenEmpty={onOpenEmpty}
      {...over}
    />
  )
  return { onActivate, onClose, onOpenEmpty }
}

describe("TabBar", () => {
  it("names a tab by its clip, and an empty one by what it shows", () => {
    renderBar()

    expect(screen.getByRole("tab", { name: "Clips" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Lighthouse" })).toBeInTheDocument()
  })

  it("says which tab is being looked at", () => {
    renderBar()

    expect(screen.getByRole("tab", { name: "Lighthouse" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Clips" })).toHaveAttribute("aria-selected", "false")
  })

  it("reports the tab that was clicked", () => {
    const { onActivate } = renderBar()

    fireEvent.click(screen.getByRole("tab", { name: "Clips" }))

    expect(onActivate).toHaveBeenCalledWith(1)
  })

  it("reports the tab to close", () => {
    const { onClose } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: "Close Lighthouse" }))

    expect(onClose).toHaveBeenCalledWith(2)
  })

  it("names a clip that has not been saved by what happens first in it", () => {
    renderBar({
      tabs: [
        { id: 3, clipId: 8, clipName: null, firstBeat: "climbs the last steps", savedFrom: null },
      ],
      activeId: 3,
    })

    expect(screen.getByRole("tab", { name: "climbs the last steps" })).toBeInTheDocument()
  })

  it("shortens a long first line, and says untitled when there is none", () => {
    renderBar({
      tabs: [
        { id: 3, clipId: 8, clipName: null, firstBeat: null, savedFrom: null },
        {
          id: 4,
          clipId: 9,
          clipName: null,
          firstBeat: "climbs the last steps of the tower and reaches for the lamp",
          savedFrom: null,
        },
      ],
      activeId: 3,
    })

    expect(screen.getByRole("tab", { name: "Untitled clip" })).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "climbs the last steps of the tow…" })
    ).toBeInTheDocument()
  })

  it("asks for another tab", () => {
    const { onOpenEmpty } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: "New tab" }))

    expect(onOpenEmpty).toHaveBeenCalled()
  })
})
