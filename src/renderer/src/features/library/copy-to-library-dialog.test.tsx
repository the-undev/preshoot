import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { listedLibrary } from "./fixtures"
import { CopyToLibraryDialog } from "./copy-to-library-dialog"

function renderDialog(over: Partial<React.ComponentProps<typeof CopyToLibraryDialog>> = {}): {
  onCopy: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
} {
  const onCopy = vi.fn()
  const onClose = vi.fn()
  render(
    <CopyToLibraryDialog
      subjectName="Anna"
      folder={listedLibrary}
      isCopying={false}
      errorMessage={null}
      copiedTo={null}
      onCopy={onCopy}
      onClose={onClose}
      {...over}
    />
  )
  return { onCopy, onClose }
}

describe("CopyToLibraryDialog", () => {
  it("copies under a kind the library already has", () => {
    const { onCopy } = renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "characters" }))
    fireEvent.click(screen.getByRole("button", { name: "Copy" }))

    expect(screen.getByLabelText("Kind")).toHaveValue("characters")
    expect(onCopy).toHaveBeenCalledWith("characters")
  })

  it("copies under a new kind typed in", () => {
    const { onCopy } = renderDialog()

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "  props  " } })
    fireEvent.click(screen.getByRole("button", { name: "Copy" }))

    expect(onCopy).toHaveBeenCalledWith("props")
  })

  it("will not copy without a kind", () => {
    renderDialog()

    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled()
  })

  it("shows the refusal when an entry of that name is already there", () => {
    renderDialog({
      errorMessage: "characters already holds an entry called Anna. Nothing was written.",
    })

    expect(
      screen.getByText("characters already holds an entry called Anna. Nothing was written.")
    ).toBeInTheDocument()
  })

  it("says where the entry was written once it is", () => {
    const { onClose } = renderDialog({ copiedTo: "/l/characters/Anna" })

    expect(screen.getByText("/l/characters/Anna")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onClose).toHaveBeenCalled()
  })

  it("will not copy when no library folder is set", () => {
    renderDialog({ folder: { state: "unset" } })

    expect(screen.getByText(/No library folder is set/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled()
  })
})
