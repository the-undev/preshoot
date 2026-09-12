import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Asset } from "@renderer/lib/trpc"
import { AssetForm } from "./asset-form"

const keeper: Asset = {
  id: 1,
  kind: "person",
  name: "Keeper",
  description: "an elderly man in oilskins",
  createdAt: "2026-09-12T08:00:00.000Z",
}

describe("AssetForm", () => {
  it("reports a new thing without its surrounding space", () => {
    const onSubmit = vi.fn()
    render(<AssetForm asset={null} onSubmit={onSubmit} onCancel={vi.fn()} isSaving={false} />)

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Lamp  " } })
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  brass and glass  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(onSubmit).toHaveBeenCalledWith({
      kind: "person",
      name: "Lamp",
      description: "brass and glass",
    })
  })

  it("does not submit until there is a name and a description", () => {
    const onSubmit = vi.fn()
    render(<AssetForm asset={null} onSubmit={onSubmit} onCancel={vi.fn()} isSaving={false} />)

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Lamp" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("seeds the fields from the thing being rewritten", () => {
    render(<AssetForm asset={keeper} onSubmit={vi.fn()} onCancel={vi.fn()} isSaving={false} />)

    expect(screen.getByLabelText("Name")).toHaveValue("Keeper")
    expect(screen.getByLabelText("Description")).toHaveValue("an elderly man in oilskins")
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  it("holds the button while a change is being saved", () => {
    render(<AssetForm asset={keeper} onSubmit={vi.fn()} onCancel={vi.fn()} isSaving={true} />)

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("reports a cancel", () => {
    const onCancel = vi.fn()
    render(<AssetForm asset={keeper} onSubmit={vi.fn()} onCancel={onCancel} isSaving={false} />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onCancel).toHaveBeenCalled()
  })
})
