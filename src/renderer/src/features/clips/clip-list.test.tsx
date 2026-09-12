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
    form: "t2v",
    shortEdge: 768,
    aspectRatio: "auto",
    seed: 0,
    shots: 2,
    durationMs: 7500,
    prompts: 3,
    createdAt: "2026-09-12T08:00:00.000Z",
  },
  {
    id: 1,
    name: "Lighthouse",
    target: "minimax-h3",
    style: "Live-action, cinematic",
    note: "",
    musicNote: "",
    form: "i2v",
    shortEdge: 768,
    aspectRatio: "auto",
    seed: 0,
    shots: 1,
    durationMs: 4000,
    prompts: 0,
    createdAt: "2026-09-11T08:00:00.000Z",
  },
]

describe("ClipList", () => {
  it("lists the clips in the order given", () => {
    render(
      <ClipList
        clips={clips}
        selectedId={1}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
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
        selectedId={1}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText("Text · 2 shots · 7.5s")).toBeInTheDocument()
    expect(screen.getByText("Image · 1 shot · 4.0s")).toBeInTheDocument()
  })

  it("reports the clip that was chosen", () => {
    const onSelect = vi.fn()
    render(
      <ClipList
        clips={clips}
        selectedId={1}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /^Lamp room/ }))

    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it("starts a clip with the name typed, without its surrounding space", () => {
    const onCreate = vi.fn()
    render(
      <ClipList
        clips={clips}
        selectedId={null}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onRemove={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText("New clip name"), { target: { value: "  Storm  " } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(onCreate).toHaveBeenCalledWith("Storm")
  })

  it("reports the clip to delete", () => {
    const onRemove = vi.fn()
    render(
      <ClipList
        clips={clips}
        selectedId={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
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
        selectedId={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText("No clips in this project yet.")).toBeInTheDocument()
  })
})
