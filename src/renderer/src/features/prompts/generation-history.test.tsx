import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { GenerationRecord } from "@renderer/lib/trpc"
import { GenerationHistory } from "./generation-history"

const fields = {
  integrated_multimodal_description: "[Shot 1] Live-action, a baker opens the shutters.",
  overall_soundscape: "Wooden shutters scrape open over a quiet street.",
  non_diegetic_music: "A soft acoustic-guitar pattern at a moderate tempo.",
}

function generation(over: Partial<GenerationRecord>): GenerationRecord {
  return {
    id: 1,
    target: "minimax-h3",
    composer: "prose",
    clipId: 1,
    clipNote: "A brief.",
    fields,
    composition: null,
    request: null,
    prose: null,
    rendered: "integrated_multimodal_description: a prompt",
    model: "Qwen3.5-9B",
    runId: null,
    promptVariantId: null,
    systemPrompt: null,
    verdict: null,
    note: "",
    parentId: null,
    editInstruction: null,
    createdAt: "2026-09-12T08:00:00.000Z",
    ...over,
  }
}

function renderHistory(generations: GenerationRecord[]): void {
  render(
    <GenerationHistory
      generations={generations}
      isEditing={false}
      isExporting={false}
      onEdit={vi.fn()}
      onExport={vi.fn()}
      onSave={vi.fn()}
      onOpenExports={vi.fn()}
    />
  )
}

describe("GenerationHistory", () => {
  it("shows a line for every generation, folded away", () => {
    renderHistory([
      generation({ id: 2, clipNote: "Second brief.", rendered: "second" }),
      generation({ id: 1, clipNote: "First brief.", rendered: "first" }),
    ])

    expect(screen.getByText("Second brief.")).toBeInTheDocument()
    expect(screen.getByText("First brief.")).toBeInTheDocument()
    expect(screen.queryByText("second")).not.toBeInTheDocument()
  })

  it("opens an entry to the whole prompt", () => {
    renderHistory([generation({ id: 2, clipNote: "Second brief.", rendered: "second" })])

    fireEvent.click(screen.getByRole("button", { name: /Second brief./ }))

    expect(screen.getByText("second")).toBeInTheDocument()
  })

  it("keeps the order it is given", () => {
    renderHistory([
      generation({ id: 2, clipNote: "Second brief." }),
      generation({ id: 1, clipNote: "First brief." }),
    ])

    const entries = screen.getAllByRole("listitem").map((item) => item.textContent)
    expect(entries[0]).toContain("Second brief.")
    expect(entries[1]).toContain("First brief.")
  })

  it("puts an edit under the prompt it came from", () => {
    renderHistory([
      generation({
        id: 2,
        parentId: 1,
        composer: "edit",
        editInstruction: "She is happier.",
        rendered: "edited",
      }),
      generation({ id: 1, clipNote: "A brief.", rendered: "original" }),
    ])

    const [top] = screen.getAllByRole("listitem")
    expect(top.textContent).toContain("A brief.")
    expect(top.textContent).toContain("She is happier.")
  })

  it("nests a chain of edits as deep as it goes", () => {
    renderHistory([
      generation({ id: 3, parentId: 2, composer: "edit", editInstruction: "Faster." }),
      generation({ id: 2, parentId: 1, composer: "edit", editInstruction: "Happier." }),
      generation({ id: 1 }),
    ])

    expect(screen.getAllByRole("list")).toHaveLength(3)
  })

  it("shows an edit whose parent is not in the list on its own", () => {
    renderHistory([
      generation({ id: 5, parentId: 99, composer: "edit", editInstruction: "Faster." }),
    ])

    expect(screen.getByText("Faster.")).toBeInTheDocument()
  })

  it("says where earlier prompts will go when there are none", () => {
    renderHistory([])

    expect(screen.getByText("Earlier prompts appear here.")).toBeInTheDocument()
  })
})
