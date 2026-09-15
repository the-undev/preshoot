import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AssetForm } from "./asset-form"
import type { AssetFields } from "./use-assets"

const keeper: AssetFields = {
  kind: "person",
  name: "Keeper",
  description: "an elderly man in oilskins",
  voice: null,
}

function renderForm(over: Partial<React.ComponentProps<typeof AssetForm>> = {}): {
  onChange: ReturnType<typeof vi.fn>
  onSubmit: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  render(
    <AssetForm
      fields={keeper}
      isExisting={true}
      isSaving={false}
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...over}
    />
  )
  return { onChange, onSubmit }
}

describe("AssetForm", () => {
  it("shows the fields it was given", () => {
    renderForm()

    expect(screen.getByLabelText("Name")).toHaveValue("Keeper")
    expect(screen.getByLabelText("Description")).toHaveValue("an elderly man in oilskins")
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  it("reports every change as it is typed", () => {
    const { onChange } = renderForm()

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Lighthouse keeper" } })

    expect(onChange).toHaveBeenCalledWith({ ...keeper, name: "Lighthouse keeper" })
  })

  it("adds rather than saves when the thing is new", () => {
    renderForm({
      isExisting: false,
      fields: { kind: "object", name: "", description: "", voice: null },
    })

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument()
  })

  it("will not submit without a name and a description", () => {
    const { onSubmit } = renderForm({ fields: { ...keeper, description: "  " } })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("submits what it was given", () => {
    const { onSubmit } = renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSubmit).toHaveBeenCalled()
  })

  it("holds the button while a change is being saved", () => {
    renderForm({ isSaving: true })

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("shows whatever is put inside it, such as the pictures", () => {
    renderForm({ children: <p>Reference pictures</p> })

    expect(screen.getByText("Reference pictures")).toBeInTheDocument()
  })
})
