import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { LibraryEntry } from "@renderer/lib/trpc"
import { AddToProjectDialog } from "./add-to-project-dialog"

const daniel: LibraryEntry = {
  kind: "characters",
  name: "Daniel",
  path: "/l/characters/Daniel",
  notes: "A man in his late thirties.",
  files: [],
}

function renderDialog(entry: LibraryEntry = daniel): { onAdd: ReturnType<typeof vi.fn> } {
  const onAdd = vi.fn()
  render(
    <AddToProjectDialog
      entry={entry}
      isSaving={false}
      errorMessage={null}
      onAdd={onAdd}
      onCancel={vi.fn()}
    />
  )
  return { onAdd }
}

describe("AddToProjectDialog", () => {
  it("starts the description from the entry's notes", () => {
    renderDialog()

    expect(screen.getByRole("heading", { name: "Use Daniel in this project" })).toBeInTheDocument()
    expect(screen.getByLabelText("Description")).toHaveValue("A man in his late thirties.")
  })

  it("makes the subject as the kind chosen, with the description as it stands", () => {
    const { onAdd } = renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "place" }))
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  A man at a bus shelter.  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Use in project" }))

    expect(onAdd).toHaveBeenCalledWith({ kind: "place", description: "A man at a bus shelter." })
  })

  it("will not make a subject without a description", () => {
    const { onAdd } = renderDialog({ ...daniel, notes: null })

    expect(screen.getByRole("button", { name: "Use in project" })).toBeDisabled()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
