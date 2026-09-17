import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ClipSummary } from "@renderer/lib/trpc"
import { ClipList } from "./clip-list"

const clips: ClipSummary[] = [
  {
    id: 2,
    name: "Lamp room",
    target: "minimax-h3",
    style: "vintage film",
    note: "",
    musicNote: "",
    soundscape: "",
    form: "t2v",
    shortEdge: 768,
    aspectRatio: "16:9",
    language: "English",
    savedFromId: null,
    shots: 2,
    durationMs: 7500,
    createdAt: "2026-09-12T08:00:00.000Z",
  },
  {
    id: 1,
    name: "Lighthouse",
    target: "minimax-h3",
    style: "Live-action, cinematic",
    note: "",
    musicNote: "",
    soundscape: "",
    form: "i2v",
    shortEdge: 768,
    aspectRatio: "16:9",
    language: "English",
    savedFromId: null,
    shots: 1,
    durationMs: 4000,
    createdAt: "2026-09-11T08:00:00.000Z",
  },
]

describe("ClipList", () => {
  it("lists the clips in the order given", () => {
    render(
      <ClipList
        clips={clips}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onPaste={vi.fn()}
        onBranch={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    const names = screen.getAllByRole("listitem").map((item) => item.textContent)
    expect(names[0]).toContain("Lamp room")
    expect(names[1]).toContain("Lighthouse")
  })

  it("says how each clip is written, how many shots it has and how long it runs", () => {
    render(
      <ClipList
        clips={clips}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onPaste={vi.fn()}
        onBranch={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText("Text · 2 shots · 7.5s")).toBeInTheDocument()
    expect(screen.getByText("Image · 1 shot · 4.0s")).toBeInTheDocument()
  })

  it("opens the clip that was chosen", () => {
    const onOpen = vi.fn()
    render(
      <ClipList
        clips={clips}
        onOpen={onOpen}
        onCreate={vi.fn()}
        onPaste={vi.fn()}
        onBranch={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /^Lamp room/ }))

    expect(onOpen).toHaveBeenCalledWith(2)
  })

  it("starts a clip", () => {
    const onCreate = vi.fn()
    render(
      <ClipList
        clips={clips}
        onOpen={vi.fn()}
        onCreate={onCreate}
        onPaste={vi.fn()}
        onBranch={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "New clip" }))

    expect(onCreate).toHaveBeenCalled()
  })

  it("reports the clip to branch", () => {
    const onBranch = vi.fn()
    render(
      <ClipList
        clips={clips}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onPaste={vi.fn()}
        onBranch={onBranch}
        onRemove={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Branch Lamp room" }))

    expect(onBranch).toHaveBeenCalledWith(2)
  })

  it("reports the clip to delete", () => {
    const onRemove = vi.fn()
    render(
      <ClipList
        clips={clips}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onPaste={vi.fn()}
        onBranch={vi.fn()}
        onRemove={onRemove}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Delete Lamp room" }))

    expect(onRemove).toHaveBeenCalledWith(clips[0])
  })

  it("says so when the project has no clips", () => {
    render(
      <ClipList
        clips={[]}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onPaste={vi.fn()}
        onBranch={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
  })

  it("offers to open a prompt from somewhere else", () => {
    const onPaste = vi.fn()
    render(
      <ClipList
        clips={[]}
        onCreate={vi.fn()}
        onPaste={onPaste}
        onOpen={vi.fn()}
        onBranch={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Paste a prompt" }))

    expect(onPaste).toHaveBeenCalled()
  })
})
