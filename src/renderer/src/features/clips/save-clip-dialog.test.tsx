import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SaveClipDialog } from "./save-clip-dialog"

function renderDialog(name: string | null): {
  onSave: ReturnType<typeof vi.fn>
  onCancel: ReturnType<typeof vi.fn>
} {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(<SaveClipDialog name={name} onSave={onSave} onCancel={onCancel} />)
  return { onSave, onCancel }
}

describe("SaveClipDialog", () => {
  it("asks for a name the first time a clip is saved", () => {
    renderDialog(null)

    expect(screen.getByRole("heading", { name: "Save this clip" })).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("")
  })

  it("starts from the name it already has when renaming", () => {
    renderDialog("Lighthouse")

    expect(screen.getByRole("heading", { name: "Rename this clip" })).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("Lighthouse")
  })

  it("saves under the name typed, without its surrounding space", () => {
    const { onSave } = renderDialog(null)

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Lamp room  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith("Lamp room")
  })

  it("will not save without a name", () => {
    renderDialog(null)

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("reports a cancel rather than saving", () => {
    const { onSave, onCancel } = renderDialog("Lighthouse")

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onCancel).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
