import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PastePromptDialog } from "./paste-prompt-dialog"

function renderDialog(): {
  onPaste: ReturnType<typeof vi.fn>
  onCancel: ReturnType<typeof vi.fn>
} {
  const onPaste = vi.fn()
  const onCancel = vi.fn()
  render(<PastePromptDialog onPaste={onPaste} onCancel={onCancel} />)
  return { onPaste, onCancel }
}

describe("PastePromptDialog", () => {
  it("has nothing to open until something is pasted", () => {
    renderDialog()

    expect(screen.getByRole("button", { name: "Open it" })).toBeDisabled()
  })

  it("hands over what was pasted", () => {
    const { onPaste } = renderDialog()

    fireEvent.change(screen.getByLabelText("The prompt to open"), {
      target: { value: "[Shot 1] A gull lands." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Open it" }))

    expect(onPaste).toHaveBeenCalledWith("[Shot 1] A gull lands.")
  })

  it("takes the space off either end of it", () => {
    const { onPaste } = renderDialog()

    fireEvent.change(screen.getByLabelText("The prompt to open"), {
      target: { value: "\n  A gull lands.  \n" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Open it" }))

    expect(onPaste).toHaveBeenCalledWith("A gull lands.")
  })

  it("opens nothing when it is left", () => {
    const { onPaste, onCancel } = renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onCancel).toHaveBeenCalled()
    expect(onPaste).not.toHaveBeenCalled()
  })
})
