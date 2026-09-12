import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BriefForm } from "./brief-form"

describe("BriefForm", () => {
  it("reports the brief without its surrounding space", () => {
    const onGenerate = vi.fn()
    render(<BriefForm onGenerate={onGenerate} isPending={false} />)

    fireEvent.change(screen.getByLabelText("Brief"), {
      target: { value: "  A baker opens the shutters.  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    expect(onGenerate).toHaveBeenCalledWith("A baker opens the shutters.")
  })

  it("does not generate from an empty brief", () => {
    const onGenerate = vi.fn()
    render(<BriefForm onGenerate={onGenerate} isPending={false} />)

    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "   " } })
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    expect(onGenerate).not.toHaveBeenCalled()
  })

  it("holds the brief and the button while a request is in flight", () => {
    render(<BriefForm onGenerate={vi.fn()} isPending={true} />)

    expect(screen.getByLabelText("Brief")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled()
  })
})
