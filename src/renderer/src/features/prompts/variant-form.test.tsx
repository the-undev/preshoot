import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PromptVariant } from "@renderer/lib/trpc"
import { VariantForm } from "./variant-form"

const builtin: PromptVariant = {
  id: "builtin:minimax-h3:prose",
  targetId: "minimax-h3",
  strategy: "prose",
  name: "Built-in, prose per shot",
  systemPrompt: "You write the prose of each shot.",
  editable: false,
}

const written: PromptVariant = {
  id: "stored:1",
  targetId: "minimax-h3",
  strategy: "brief",
  name: "Terser",
  systemPrompt: "Write it shorter.",
  editable: true,
}

describe("VariantForm", () => {
  it("opens a built-in prompt as a copy, with its text", () => {
    render(<VariantForm variant={builtin} isSaving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByLabelText("Name")).toHaveValue("Built-in, prose per shot copy")
    expect(screen.getByLabelText("System prompt")).toHaveValue("You write the prose of each shot.")
  })

  it("opens a prompt written here under its own name", () => {
    render(<VariantForm variant={written} isSaving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByLabelText("Name")).toHaveValue("Terser")
    expect(screen.getByText(/whole prompt/)).toBeInTheDocument()
  })

  it("reports what was typed, keeping the kind it writes", () => {
    const onSubmit = vi.fn()
    render(
      <VariantForm variant={written} isSaving={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    )

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Much terser  " } })
    fireEvent.change(screen.getByLabelText("System prompt"), {
      target: { value: "  Write it much shorter.  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSubmit).toHaveBeenCalledWith({
      strategy: "brief",
      name: "Much terser",
      systemPrompt: "Write it much shorter.",
    })
  })

  it("will not save an empty prompt", () => {
    const onSubmit = vi.fn()
    render(
      <VariantForm variant={written} isSaving={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    )

    fireEvent.change(screen.getByLabelText("System prompt"), { target: { value: "   " } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
