import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Asset, SubjectComposition } from "@renderer/lib/trpc"
import { ClipCast } from "./clip-cast"

const keeper: SubjectComposition = {
  id: 5,
  kind: "person",
  name: "Keeper",
  description: "an elderly man",
  voice: null,
}

const savedLamp: Asset = {
  id: 9,
  clipId: null,
  kind: "object",
  name: "Lamp",
  description: "brass and glass",
  voice: null,
  createdAt: "2026-09-12T08:00:00.000Z",
}

function renderCast(over: Partial<React.ComponentProps<typeof ClipCast>> = {}): {
  onAdd: ReturnType<typeof vi.fn>
  onUpdate: ReturnType<typeof vi.fn>
  onSave: ReturnType<typeof vi.fn>
  onRemove: ReturnType<typeof vi.fn>
} {
  const handlers = {
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onSave: vi.fn(),
    onRemove: vi.fn(),
  }
  render(<ClipCast cast={[keeper]} speaking={[]} saved={[]} {...handlers} {...over} />)
  return handlers
}

describe("ClipCast", () => {
  it("reads as a chip for each of the cast", () => {
    renderCast()

    expect(screen.getByRole("button", { name: "Edit Keeper" })).toHaveTextContent("Keeper")
  })

  it("keeps how a subject looks behind their chip", () => {
    renderCast()

    expect(screen.queryByLabelText("How they look")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Edit Keeper" }))

    expect(screen.getByLabelText("How they look")).toHaveValue("an elderly man")
  })

  it("writes how a subject looks once the box is left", () => {
    const { onUpdate } = renderCast()

    fireEvent.click(screen.getByRole("button", { name: "Edit Keeper" }))
    const description = screen.getByLabelText("How they look")
    fireEvent.change(description, { target: { value: "an elderly man in oilskins" } })
    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.blur(description)
    expect(onUpdate).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ description: "an elderly man in oilskins" })
    )
  })

  it("asks how a subject sounds only once they say something", () => {
    renderCast()
    fireEvent.click(screen.getByRole("button", { name: "Edit Keeper" }))
    expect(screen.queryByLabelText("Voice")).not.toBeInTheDocument()

    renderCast({ speaking: [5] })
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Keeper" })[1])
    expect(screen.getByLabelText("Voice")).toBeInTheDocument()
  })

  it("saves a subject to the library", () => {
    const { onSave } = renderCast()

    fireEvent.click(screen.getByRole("button", { name: "Edit Keeper" }))
    fireEvent.click(screen.getByRole("button", { name: "Save Keeper to the library" }))

    expect(onSave).toHaveBeenCalledWith(5)
  })

  it("asks before taking a subject out of the clip", () => {
    const { onRemove } = renderCast()

    fireEvent.click(screen.getByRole("button", { name: "Edit Keeper" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Keeper" }))
    expect(onRemove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(onRemove).toHaveBeenCalledWith(5)
  })

  it("adds a subject written here", () => {
    const { onAdd } = renderCast()

    fireEvent.click(screen.getByRole("button", { name: "Add a subject" }))
    fireEvent.change(screen.getByLabelText("Name a new subject"), { target: { value: "Radio" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(onAdd).toHaveBeenCalledWith({
      savedId: null,
      kind: "person",
      name: "Radio",
      description: "",
    })
  })

  it("adds a subject of the kind chosen beside the name", () => {
    const { onAdd } = renderCast()

    fireEvent.click(screen.getByRole("button", { name: "Add a subject" }))
    fireEvent.click(screen.getByRole("button", { name: "Place" }))
    fireEvent.change(screen.getByLabelText("Name a new subject"), { target: { value: "Cellar" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: "place", name: "Cellar" }))
  })

  it("adds a subject the library already holds", () => {
    const { onAdd } = renderCast({ saved: [savedLamp] })

    fireEvent.click(screen.getByRole("button", { name: "Add a subject" }))
    fireEvent.click(screen.getByRole("button", { name: "Lamp" }))

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ savedId: 9 }))
  })

  it("offers nothing from the library when it holds nothing", () => {
    renderCast()

    fireEvent.click(screen.getByRole("button", { name: "Add a subject" }))

    expect(screen.queryByText("From the library")).not.toBeInTheDocument()
  })
})
