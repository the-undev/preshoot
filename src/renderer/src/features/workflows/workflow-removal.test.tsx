import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkflowRemoval } from "./workflow-removal"

describe("WorkflowRemoval", () => {
  it("names what goes with the workflow before removing it", () => {
    const onRemove = vi.fn()
    render(
      <WorkflowRemoval
        name="h3-r2v-base"
        configurationCount={1}
        runCount={4}
        isRemoving={false}
        onRemove={onRemove}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(
      screen.getByText(
        "Remove h3-r2v-base? Its 1 configuration and 4 runs go too, with their output files."
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Keep" }))
    expect(screen.queryByText(/go too/)).not.toBeInTheDocument()
    expect(onRemove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
