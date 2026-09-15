import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AspectRatio } from "@renderer/lib/trpc"
import { ResolutionPicker } from "./resolution-picker"

const shapes: AspectRatio[] = [
  { value: "16:9", name: "Widescreen", width: 16, height: 9 },
  { value: "4:3", name: "Classic", width: 4, height: 3 },
  { value: "1:1", name: "Square", width: 1, height: 1 },
  { value: "3:4", name: "Classic", width: 3, height: 4 },
  { value: "9:16", name: "Widescreen", width: 9, height: 16 },
]

function renderPicker(
  over: Partial<React.ComponentProps<typeof ResolutionPicker>> = {}
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn()
  render(
    <ResolutionPicker
      shapes={shapes}
      aspectRatio="16:9"
      shortEdge={768}
      onChange={onChange}
      {...over}
    />
  )
  return onChange
}

describe("ResolutionPicker", () => {
  it("offers the shapes of the orientation the clip is in", () => {
    renderPicker()

    expect(screen.getByRole("radio", { name: "16:9 Widescreen" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "4:3 Classic" })).toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: "9:16 Widescreen" })).not.toBeInTheDocument()
  })

  it("offers the portrait shapes when the clip is in portrait", () => {
    renderPicker({ aspectRatio: "9:16" })

    expect(screen.getByRole("radio", { name: "9:16 Widescreen" })).toBeChecked()
    expect(screen.queryByRole("radio", { name: "16:9 Widescreen" })).not.toBeInTheDocument()
  })

  it("turns the ratio on its side rather than losing it", () => {
    const onChange = renderPicker()

    fireEvent.click(screen.getByRole("button", { name: "Portrait" }))

    expect(onChange).toHaveBeenCalledWith({ aspectRatio: "9:16", shortEdge: 768 })
  })

  it("does nothing when the orientation it is already in is pressed", () => {
    const onChange = renderPicker()

    fireEvent.click(screen.getByRole("button", { name: "Landscape" }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it("reports the shape that was picked", () => {
    const onChange = renderPicker()

    fireEvent.click(screen.getByRole("radio", { name: "4:3 Classic" }))

    expect(onChange).toHaveBeenCalledWith({ aspectRatio: "4:3", shortEdge: 768 })
  })

  it("reports the short edge that was pressed", () => {
    const onChange = renderPicker()

    fireEvent.click(screen.getByRole("button", { name: "1080" }))

    expect(onChange).toHaveBeenCalledWith({ aspectRatio: "16:9", shortEdge: 1080 })
  })

  it("takes a short edge typed in", () => {
    const onChange = renderPicker()

    const box = screen.getByLabelText("Or")
    fireEvent.change(box, { target: { value: "900" } })
    fireEvent.blur(box)

    expect(onChange).toHaveBeenCalledWith({ aspectRatio: "16:9", shortEdge: 900 })
  })

  it("keeps the short edge it had when the box is emptied", () => {
    const onChange = renderPicker()

    const box = screen.getByLabelText("Or")
    fireEvent.change(box, { target: { value: "" } })
    fireEvent.blur(box)

    expect(onChange).not.toHaveBeenCalled()
    expect(box).toHaveValue(768)
  })

  it("says the size in pixels the clip generates at", () => {
    renderPicker({ shortEdge: 1080 })

    expect(screen.getByText("1920 × 1080")).toBeInTheDocument()
  })
})
