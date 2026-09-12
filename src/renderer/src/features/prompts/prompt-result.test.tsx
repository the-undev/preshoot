import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { GenerationRecord } from "@renderer/lib/trpc"
import { PromptResult } from "./prompt-result"

const generation: GenerationRecord = {
  id: 7,
  target: "minimax-h3",
  composer: "prose",
  clipId: 1,
  brief: "A keeper lights the lamp.",
  fields: { integrated_multimodal_description: "one two three" },
  composition: null,
  request: null,
  prose: null,
  rendered: "integrated_multimodal_description: [Shot 1] ...",
  model: "Qwen3.5-9B",
  runId: null,
  promptVariantId: null,
  systemPrompt: null,
  verdict: null,
  note: "",
  parentId: null,
  editInstruction: null,
  createdAt: "2026-09-12T08:00:00.000Z",
}

function renderResult(over: Partial<React.ComponentProps<typeof PromptResult>> = {}): {
  onEdit: ReturnType<typeof vi.fn>
  onExport: ReturnType<typeof vi.fn>
  onSave: ReturnType<typeof vi.fn>
} {
  const onEdit = vi.fn()
  const onExport = vi.fn()
  const onSave = vi.fn()
  render(
    <PromptResult
      generation={generation}
      isEditing={false}
      isExporting={false}
      onEdit={onEdit}
      onExport={onExport}
      onSave={onSave}
      onOpenExports={vi.fn()}
      {...over}
    />
  )
  return { onEdit, onExport, onSave }
}

describe("PromptResult", () => {
  it("shows the brief and the prompt", () => {
    renderResult()

    expect(screen.getByText("A keeper lights the lamp.")).toBeInTheDocument()
    expect(screen.getByText("integrated_multimodal_description: [Shot 1] ...")).toBeInTheDocument()
  })

  it("reports the change to make, without its surrounding space", () => {
    const { onEdit } = renderResult()

    fireEvent.change(screen.getByLabelText("Change to make to prompt 7"), {
      target: { value: "  She is happier.  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))

    expect(onEdit).toHaveBeenCalledWith(7, "She is happier.")
  })

  it("does not edit from an empty change", () => {
    const { onEdit } = renderResult()

    fireEvent.change(screen.getByLabelText("Change to make to prompt 7"), {
      target: { value: "   " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))

    expect(onEdit).not.toHaveBeenCalled()
  })

  it("reports the prompt to export and to save", () => {
    const { onExport, onSave } = renderResult()

    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onExport).toHaveBeenCalledWith(7)
    expect(onSave).toHaveBeenCalledWith(7)
  })

  it("holds the edit box while an edit is in flight", () => {
    renderResult({ isEditing: true })

    expect(screen.getByLabelText("Change to make to prompt 7")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Editing…" })).toBeDisabled()
  })

  it("says how long the body is, and when it is short", () => {
    renderResult()

    expect(screen.getByText(/3 words, short of the 350 a generation wants/)).toBeInTheDocument()
  })

  it("says nothing about length when the body is long enough", () => {
    renderResult({
      generation: {
        ...generation,
        fields: { integrated_multimodal_description: "word ".repeat(400) },
      },
    })

    expect(screen.getByText("400 words")).toBeInTheDocument()
  })

  it("says what change made an edited prompt", () => {
    renderResult({
      generation: { ...generation, composer: "edit", editInstruction: "She is happier." },
    })

    expect(screen.getByText("Edited: She is happier.")).toBeInTheDocument()
  })
})
