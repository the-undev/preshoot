import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { WorkflowSlot } from "@renderer/lib/trpc"
import { WorkflowGuide, WorkflowMapping } from "./workflow-mapping"

function slot(over: Partial<WorkflowSlot>): WorkflowSlot {
  return {
    id: 1,
    workflowId: 3,
    nodeId: 14,
    nodeType: "PrimitiveStringMultiline",
    name: "Prompt",
    displayName: null,
    note: "",
    kind: "text",
    tier: "basic",
    bypassed: false,
    multiline: true,
    position: 0,
    ...over,
  }
}

const slots: WorkflowSlot[] = [
  slot({}),
  slot({
    id: 2,
    nodeId: 12,
    nodeType: "LoadImage",
    name: "Picture 3 (bypassed: Ctrl+B to use)",
    kind: "image",
    tier: "advanced",
    bypassed: true,
    position: 1,
  }),
  slot({ id: 3, nodeId: 23, nodeType: "RandomNoise", name: "Seed", kind: "seed", position: 2 }),
]

describe("WorkflowMapping", () => {
  it("groups the slots by tier", () => {
    render(<WorkflowMapping slots={slots} onSetTier={vi.fn()} onSetLabel={vi.fn()} />)

    const basic = within(screen.getByRole("region", { name: "Basic" }))
    const advanced = within(screen.getByRole("region", { name: "Advanced" }))
    const hidden = within(screen.getByRole("region", { name: "Hidden" }))
    expect(basic.getByText("Prompt")).toBeInTheDocument()
    expect(basic.getByRole("button", { name: "Hidden: Seed" })).toBeInTheDocument()
    expect(advanced.getByText("Picture 3 (bypassed: Ctrl+B to use)")).toBeInTheDocument()
    expect(hidden.getByText("Nothing here.")).toBeInTheDocument()
  })

  it("says what each slot takes, and when it is bypassed in the workflow", () => {
    render(<WorkflowMapping slots={slots} onSetTier={vi.fn()} onSetLabel={vi.fn()} />)

    expect(screen.getByText("Text")).toBeInTheDocument()
    expect(screen.getByText("Image · bypassed in the workflow")).toBeInTheDocument()
  })

  it("marks the tier each slot is at", () => {
    render(<WorkflowMapping slots={slots} onSetTier={vi.fn()} onSetLabel={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Basic: Seed" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Hidden: Seed" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("moves a slot to the tier picked for it", () => {
    const onSetTier = vi.fn()
    render(<WorkflowMapping slots={slots} onSetTier={onSetTier} onSetLabel={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Hidden: Seed" }))

    expect(onSetTier).toHaveBeenCalledWith(3, "hidden")
  })

  it("asks for nothing when the tier picked is the one it is at", () => {
    const onSetTier = vi.fn()
    render(<WorkflowMapping slots={slots} onSetTier={onSetTier} onSetLabel={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Basic: Seed" }))

    expect(onSetTier).not.toHaveBeenCalled()
  })

  it("keeps the scanned name, with the display name and note beside it", () => {
    render(
      <WorkflowMapping
        slots={[slot({ displayName: "Scene", note: "Say what moves." })]}
        onSetTier={vi.fn()}
        onSetLabel={vi.fn()}
      />
    )

    expect(screen.getByText("Prompt")).toBeInTheDocument()
    expect(screen.getByText("Text · shown as Scene")).toBeInTheDocument()
    expect(screen.getByText("Say what moves.")).toBeInTheDocument()
  })

  it("saves a display name and note typed for a slot", () => {
    const onSetLabel = vi.fn()
    render(<WorkflowMapping slots={slots} onSetTier={vi.fn()} onSetLabel={onSetLabel} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit Seed" }))
    const form = within(screen.getByRole("form", { name: "Label for Seed" }))
    expect(form.getByLabelText("Shown as")).toHaveAttribute("placeholder", "Seed")
    fireEvent.change(form.getByLabelText("Shown as"), { target: { value: "Noise seed" } })
    fireEvent.change(form.getByLabelText("Note"), { target: { value: "Keep it fixed." } })
    fireEvent.click(form.getByRole("button", { name: "Save" }))

    expect(onSetLabel).toHaveBeenCalledWith(3, {
      displayName: "Noise seed",
      note: "Keep it fixed.",
    })
    expect(screen.queryByRole("form", { name: "Label for Seed" })).not.toBeInTheDocument()
  })

  it("clears a display name and note by saving them empty", () => {
    const onSetLabel = vi.fn()
    render(
      <WorkflowMapping
        slots={[slot({ displayName: "Scene", note: "Say what moves." })]}
        onSetTier={vi.fn()}
        onSetLabel={onSetLabel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Edit Prompt" }))
    const form = within(screen.getByRole("form", { name: "Label for Prompt" }))
    expect(form.getByLabelText("Shown as")).toHaveValue("Scene")
    fireEvent.change(form.getByLabelText("Shown as"), { target: { value: "" } })
    fireEvent.change(form.getByLabelText("Note"), { target: { value: "" } })
    fireEvent.click(form.getByRole("button", { name: "Save" }))

    expect(onSetLabel).toHaveBeenCalledWith(1, { displayName: "", note: "" })
  })

  it("saves nothing when the edit is cancelled", () => {
    const onSetLabel = vi.fn()
    render(<WorkflowMapping slots={slots} onSetTier={vi.fn()} onSetLabel={onSetLabel} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit Seed" }))
    const form = within(screen.getByRole("form", { name: "Label for Seed" }))
    fireEvent.change(form.getByLabelText("Shown as"), { target: { value: "Noise seed" } })
    fireEvent.keyDown(form.getByLabelText("Shown as"), { key: "Escape" })

    expect(onSetLabel).not.toHaveBeenCalled()
    expect(screen.queryByRole("form", { name: "Label for Seed" })).not.toBeInTheDocument()
  })
})

describe("WorkflowGuide", () => {
  it("shows each note under its title", () => {
    render(
      <WorkflowGuide
        guide={[
          { nodeId: 15, title: "How to use", text: "# h3-r2v-base\n\n1. **References.**" },
          { nodeId: 40, title: null, text: "Keep the seed." },
        ]}
      />
    )

    expect(screen.getByText("How to use")).toBeInTheDocument()
    expect(screen.getByText(/1\. \*\*References\.\*\*/)).toBeInTheDocument()
    expect(screen.getByText("Note")).toBeInTheDocument()
    expect(screen.getByText("Keep the seed.")).toBeInTheDocument()
  })

  it("says when the workflow has no notes", () => {
    render(<WorkflowGuide guide={[]} />)

    expect(screen.getByText("The workflow has no notes.")).toBeInTheDocument()
  })
})
