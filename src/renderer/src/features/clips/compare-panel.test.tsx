import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { GenerationRecord, PromptVariant, RunSummary } from "@renderer/lib/trpc"
import { ComparePanel } from "./compare-panel"

const composers = [
  { id: "prose", name: "Model prose per shot" },
  { id: "assembled", name: "Assembled without the model" },
]

const variants: PromptVariant[] = [
  {
    id: "builtin:minimax-h3:prose",
    targetId: "minimax-h3",
    strategy: "prose",
    name: "Built-in, prose per shot",
    systemPrompt: "You write the prose of each shot.",
    editable: false,
  },
]

function result(id: number, composer: string, verdict: string | null): GenerationRecord {
  return {
    id,
    target: "minimax-h3",
    composer,
    clipId: 1,
    clipNote: "A keeper lights the lamp.",
    fields: {},
    composition: null,
    request: null,
    prose: null,
    rendered: `Prompt ${id}`,
    model: "Qwen3.5-9B",
    runId: "run-1",
    promptVariantId: "builtin:minimax-h3:prose",
    systemPrompt: "You write the prose of each shot.",
    verdict,
    note: "",
    parentId: null,
    editInstruction: null,
    createdAt: "2026-09-12T08:00:00.000Z",
  }
}

const runs: RunSummary[] = [
  { runId: "run-2", ranAt: "2026-09-12T10:00:00.000Z", written: 2, good: 1 },
  { runId: "run-1", ranAt: "2026-09-12T09:00:00.000Z", written: 3, good: 0 },
]

function renderPanel(over: Partial<React.ComponentProps<typeof ComparePanel>> = {}): {
  onAddPair: ReturnType<typeof vi.fn>
  onRun: ReturnType<typeof vi.fn>
  onVerdict: ReturnType<typeof vi.fn>
  onNote: ReturnType<typeof vi.fn>
  onRemovePair: ReturnType<typeof vi.fn>
} {
  const onAddPair = vi.fn()
  const onRun = vi.fn()
  const onVerdict = vi.fn()
  const onNote = vi.fn()
  const onRemovePair = vi.fn()
  render(
    <ComparePanel
      composers={composers}
      variants={variants}
      pairs={[]}
      runs={[]}
      runId={null}
      results={[]}
      failure={null}
      isPending={false}
      onAddPair={onAddPair}
      onRemovePair={onRemovePair}
      onRun={onRun}
      onChooseRun={vi.fn()}
      onVerdict={onVerdict}
      onNote={onNote}
      {...over}
    />
  )
  return { onAddPair, onRun, onVerdict, onNote, onRemovePair }
}

describe("ComparePanel", () => {
  it("asks for two ways before it will run", () => {
    renderPanel()

    expect(
      screen.getByText("Add two or more ways of writing this clip to compare them.")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Run comparison" })).toBeDisabled()
  })

  it("adds the way and prompt that are showing", () => {
    const { onAddPair } = renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Add to run" }))

    expect(onAddPair).toHaveBeenCalledWith({
      composerId: "prose",
      variantId: "builtin:minimax-h3:prose",
    })
  })

  it("lists what is in the run and runs it", () => {
    const pairs = [
      { composerId: "prose", variantId: "builtin:minimax-h3:prose" },
      { composerId: "assembled", variantId: null },
    ]
    const { onRun } = renderPanel({ pairs })

    expect(screen.getByText(/Model prose per shot · Built-in, prose per shot/)).toBeInTheDocument()
    expect(screen.getByText(/Assembled without the model · built-in prompt/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Run comparison" }))
    expect(onRun).toHaveBeenCalled()
  })

  it("shows one result per way, with what wrote it", () => {
    renderPanel({ results: [result(1, "prose", null), result(2, "assembled", null)] })

    expect(screen.getByText("Prompt 1")).toBeInTheDocument()
    expect(screen.getByText("Prompt 2")).toBeInTheDocument()
    expect(screen.getByLabelText("Note on Model prose per shot")).toBeInTheDocument()
    expect(screen.getByLabelText("Note on Assembled without the model")).toBeInTheDocument()
  })

  it("reports a verdict without touching the note", () => {
    const { onVerdict, onNote } = renderPanel({ results: [result(7, "prose", null)] })

    fireEvent.click(screen.getByRole("button", { name: "Good" }))

    expect(onVerdict).toHaveBeenCalledWith(7, "good")
    expect(onNote).not.toHaveBeenCalled()
  })

  it("takes a verdict back when it is pressed again", () => {
    const { onVerdict } = renderPanel({ results: [result(7, "prose", "good")] })

    fireEvent.click(screen.getByRole("button", { name: "Good" }))

    expect(onVerdict).toHaveBeenCalledWith(7, null)
  })

  it("reports a note once the box is left", () => {
    const { onNote } = renderPanel({ results: [result(7, "prose", null)] })

    const box = screen.getByLabelText("Note on Model prose per shot")
    fireEvent.change(box, { target: { value: "Lost the keeper." } })
    fireEvent.blur(box)

    expect(onNote).toHaveBeenCalledWith(7, "Lost the keeper.")
  })

  it("lists the runs the clip has", () => {
    renderPanel({ runs, runId: "run-2" })

    expect(screen.getByLabelText("Run")).toHaveTextContent("2 written · 1 good")
  })

  it("says where a run stopped", () => {
    renderPanel({
      failure: { composerId: "prose", message: "llama-server answered badly." },
    })

    expect(
      screen.getByText("Stopped at Model prose per shot: llama-server answered badly.")
    ).toBeInTheDocument()
  })
})
