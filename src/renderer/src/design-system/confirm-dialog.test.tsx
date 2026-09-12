import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ConfirmDialog } from "./confirm-dialog"

describe("ConfirmDialog", () => {
  it("names what is going and what goes with it", () => {
    render(
      <ConfirmDialog
        title="Delete shot 2?"
        description="What it shows goes with it."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText("Delete shot 2?")).toBeInTheDocument()
    expect(screen.getByText("What it shows goes with it.")).toBeInTheDocument()
  })

  it("reports a confirmation", () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        title="Delete shot 2?"
        description="What it shows goes with it."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    expect(onConfirm).toHaveBeenCalled()
  })

  it("reports a cancel", () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        title="Delete shot 2?"
        description="What it shows goes with it."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onCancel).toHaveBeenCalled()
  })
})
