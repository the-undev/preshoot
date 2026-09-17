import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CommandMenu, type Command } from "./command-menu"

function commands(run: () => void = vi.fn()): Command[] {
  return [
    { id: "one", label: "Show something", group: "This line", run },
    { id: "two", label: "New shot", group: "Shot", run },
    { id: "three", label: "push in", group: "Camera", run },
  ]
}

describe("CommandMenu", () => {
  it("lists everything it is given, under its group", () => {
    render(<CommandMenu commands={commands()} onClose={vi.fn()} />)

    expect(screen.getByRole("option", { name: "Show something" })).toBeInTheDocument()
    expect(screen.getByText("Camera")).toBeInTheDocument()
  })

  it("narrows the list to what is typed", () => {
    render(<CommandMenu commands={commands()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText("What to do"), { target: { value: "push" } })

    expect(screen.getByRole("option", { name: "push in" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "New shot" })).not.toBeInTheDocument()
  })

  it("says when nothing goes by that name", () => {
    render(<CommandMenu commands={commands()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText("What to do"), { target: { value: "zzz" } })

    expect(screen.getByText("Nothing goes by that name.")).toBeInTheDocument()
  })

  it("runs what was clicked and closes", () => {
    const run = vi.fn()
    const onClose = vi.fn()
    render(<CommandMenu commands={commands(run)} onClose={onClose} />)

    fireEvent.click(screen.getByRole("option", { name: "New shot" }))

    expect(run).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("starts on the first one and moves with the arrows", () => {
    render(<CommandMenu commands={commands()} onClose={vi.fn()} />)
    const box = screen.getByLabelText("What to do")

    expect(screen.getByRole("option", { name: "Show something" })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    fireEvent.keyDown(box, { key: "ArrowDown" })
    expect(screen.getByRole("option", { name: "New shot" })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    fireEvent.keyDown(box, { key: "ArrowUp" })
    expect(screen.getByRole("option", { name: "Show something" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  it("runs the highlighted one on enter", () => {
    const run = vi.fn()
    const onClose = vi.fn()
    render(<CommandMenu commands={commands(run)} onClose={onClose} />)
    const box = screen.getByLabelText("What to do")

    fireEvent.keyDown(box, { key: "ArrowDown" })
    fireEvent.keyDown(box, { key: "Enter" })

    expect(run).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("keeps the highlight inside a list that has been narrowed under it", () => {
    render(<CommandMenu commands={commands()} onClose={vi.fn()} />)
    const box = screen.getByLabelText("What to do")

    fireEvent.keyDown(box, { key: "ArrowDown" })
    fireEvent.keyDown(box, { key: "ArrowDown" })
    fireEvent.change(box, { target: { value: "shot" } })

    expect(screen.getByRole("option", { name: "New shot" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })
})
