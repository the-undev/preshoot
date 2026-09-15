import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AspectRatio, ClipComposition, OpenTab } from "@renderer/lib/trpc"
import { ClipBar } from "./clip-bar"

const shapes: AspectRatio[] = [{ value: "16:9", name: "Widescreen", width: 16, height: 9 }]

const composition = {
  id: 1,
  name: "Lighthouse",
  form: "t2v",
  shortEdge: 1080,
  aspectRatio: "16:9",
  frames: [],
  style: "Live-action",
  note: "",
  musicNote: "",
  language: "English",
  speakers: [],
  shots: [],
} as unknown as ClipComposition

const saved: OpenTab = {
  id: 1,
  clipId: 7,
  clipName: "Lighthouse",
  firstBeat: "climbs the last steps",
  savedFrom: null,
}

const scratch: OpenTab = { ...saved, clipName: null }

function renderBar(tab: OpenTab = saved): {
  onSave: ReturnType<typeof vi.fn>
  onBranch: ReturnType<typeof vi.fn>
  onSettings: ReturnType<typeof vi.fn>
} {
  const onSave = vi.fn()
  const onBranch = vi.fn()
  const onSettings = vi.fn()
  render(
    <ClipBar
      tab={tab}
      composition={composition}
      aspectRatios={shapes}
      isSaving={false}
      onSave={onSave}
      onBranch={onBranch}
      onSettings={onSettings}
    />
  )
  return { onSave, onBranch, onSettings }
}

describe("ClipBar", () => {
  it("names a saved clip and offers to rename it", () => {
    const { onSave } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: "Rename Lighthouse" }))

    expect(onSave).toHaveBeenCalled()
  })

  it("says a clip has not been saved, and calls it by what happens in it", () => {
    renderBar(scratch)

    expect(screen.getByRole("button", { name: "Save this clip" })).toHaveTextContent(
      "climbs the last steps"
    )
    expect(screen.getByText("not saved")).toBeInTheDocument()
  })

  it("says which saved clip this one is based on", () => {
    renderBar({ ...scratch, savedFrom: "Lighthouse" })

    expect(screen.getByText("based on Lighthouse")).toBeInTheDocument()
  })

  it("says nothing about where a clip came from when it came from nowhere", () => {
    renderBar()

    expect(screen.queryByText(/^based on/)).not.toBeInTheDocument()
  })

  it("asks to save the clip", () => {
    const { onSave } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))

    expect(onSave).toHaveBeenCalled()
  })

  it("says what the clip generates at, without leaving the shots", () => {
    renderBar()

    expect(screen.getByRole("button", { name: "Clip settings: t2va" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clip settings: 16:9" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clip settings: 1920 × 1080" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clip settings: Live-action" })).toBeInTheDocument()
  })

  it("opens the settings from a chip as well as from the button", () => {
    const { onSettings } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: "Clip settings: 16:9" }))
    fireEvent.click(screen.getByRole("button", { name: /^Settings/ }))

    expect(onSettings).toHaveBeenCalledTimes(2)
  })

  it("asks to branch the clip", () => {
    const { onBranch } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: /^Branch/ }))

    expect(onBranch).toHaveBeenCalled()
  })
})
