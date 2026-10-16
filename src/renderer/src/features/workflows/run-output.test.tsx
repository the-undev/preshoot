import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { RunOutput } from "@renderer/lib/trpc"
import { RunOutputItem } from "./run-output"

function output(over: Partial<RunOutput>): RunOutput {
  return {
    id: 9,
    runId: 4,
    path: "outputs/run-4/frame.png",
    sourceFilename: "frame.png",
    media: "image",
    verdict: null,
    note: "",
    ...over,
  }
}

function renderItem(over: Partial<RunOutput> = {}): {
  onOpen: ReturnType<typeof vi.fn>
  onSetVerdict: ReturnType<typeof vi.fn>
  onSetNote: ReturnType<typeof vi.fn>
} {
  const handlers = { onOpen: vi.fn(), onSetVerdict: vi.fn(), onSetNote: vi.fn() }
  render(
    <ul>
      <RunOutputItem output={output(over)} {...handlers} />
    </ul>
  )
  return handlers
}

describe("RunOutputItem", () => {
  it("shows a picture as a thumbnail through output://, which opens it when clicked", () => {
    const { onOpen } = renderItem()

    expect(screen.getByRole("img", { name: "frame.png" })).toHaveAttribute(
      "src",
      `output://file/${encodeURIComponent("outputs/run-4/frame.png")}?width=320`
    )
    fireEvent.click(screen.getByRole("button", { name: "Open frame.png" }))
    expect(onOpen).toHaveBeenCalled()
  })

  it("plays a video in place with controls and without starting on its own", () => {
    renderItem({ path: "outputs/run-4/clip.mp4", media: "video" })

    const video = screen.getByLabelText("clip.mp4")
    expect(video.tagName).toBe("VIDEO")
    expect(video).toHaveAttribute(
      "src",
      `output://file/${encodeURIComponent("outputs/run-4/clip.mp4")}`
    )
    expect(video).toHaveAttribute("controls")
    expect(video).not.toHaveAttribute("autoplay")
  })

  it("plays a sound in place with controls", () => {
    renderItem({ path: "outputs/run-4/voice.wav", media: "audio" })

    const audio = screen.getByLabelText("voice.wav")
    expect(audio.tagName).toBe("AUDIO")
    expect(audio).toHaveAttribute(
      "src",
      `output://file/${encodeURIComponent("outputs/run-4/voice.wav")}`
    )
    expect(audio).toHaveAttribute("controls")
  })

  it("keeps anything else as a row that opens it outside the app", () => {
    const { onOpen } = renderItem({ path: "outputs/run-4/latent.safetensors", media: "refmod" })

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open latent.safetensors" }))
    expect(onOpen).toHaveBeenCalled()
  })

  it("marks an unmarked output good or bad", () => {
    const { onSetVerdict } = renderItem()

    expect(screen.getByRole("button", { name: "Mark good" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    fireEvent.click(screen.getByRole("button", { name: "Mark good" }))
    fireEvent.click(screen.getByRole("button", { name: "Mark bad" }))

    expect(onSetVerdict.mock.calls).toEqual([["good"], ["bad"]])
  })

  it("shows the verdict given, and clears it when its button is pressed again", () => {
    const { onSetVerdict } = renderItem({ verdict: "good" })

    expect(screen.getByRole("button", { name: "Mark good" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Mark bad" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    fireEvent.click(screen.getByRole("button", { name: "Mark good" }))
    fireEvent.click(screen.getByRole("button", { name: "Mark bad" }))

    expect(onSetVerdict.mock.calls).toEqual([[null], ["bad"]])
  })

  it("offers no note until there is a verdict", () => {
    renderItem()

    expect(screen.queryByLabelText("Note on frame.png")).not.toBeInTheDocument()
  })

  it("offers a note once there is a verdict, and saves it when the field is left", () => {
    const { onSetNote } = renderItem({ verdict: "bad" })

    const note = screen.getByLabelText("Note on frame.png")
    fireEvent.change(note, { target: { value: "  Hands melt.  " } })
    expect(onSetNote).not.toHaveBeenCalled()
    fireEvent.blur(note)

    expect(onSetNote).toHaveBeenCalledWith("Hands melt.")
  })

  it("shows a note already written even with no verdict, and saves nothing unchanged", () => {
    const { onSetNote } = renderItem({ note: "Try again at dusk." })

    const note = screen.getByLabelText("Note on frame.png")
    expect(note).toHaveValue("Try again at dusk.")
    fireEvent.blur(note)

    expect(onSetNote).not.toHaveBeenCalled()
  })
})
