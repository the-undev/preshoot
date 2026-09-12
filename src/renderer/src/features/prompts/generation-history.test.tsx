import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { GenerationRecord } from "@renderer/lib/trpc"
import { GenerationHistory } from "./generation-history"

const fields = {
  integrated_multimodal_description: "[Shot 1] Live-action, a baker opens the shutters.",
  overall_soundscape: "Wooden shutters scrape open over a quiet street.",
  non_diegetic_music: "A soft acoustic-guitar pattern at a moderate tempo.",
}

const generations: GenerationRecord[] = [
  {
    id: 2,
    target: "minimax-h3",
    composer: "brief",
    clipId: null,
    composition: null,
    prose: null,
    brief: "Second brief.",
    fields,
    rendered: "integrated_multimodal_description: second",
    model: "Qwen3.5-9B",
    runId: null,
    promptVariantId: null,
    systemPrompt: null,
    verdict: null,
    note: "",
    parentId: null,
    editInstruction: null,
    createdAt: "2026-09-12T08:00:00.000Z",
  },
  {
    id: 1,
    target: "minimax-h3",
    composer: "brief",
    clipId: null,
    composition: null,
    prose: null,
    brief: "First brief.",
    fields,
    rendered: "integrated_multimodal_description: first",
    model: "Qwen3.5-9B",
    runId: null,
    promptVariantId: null,
    systemPrompt: null,
    verdict: null,
    note: "",
    parentId: null,
    editInstruction: null,
    createdAt: "2026-09-11T08:00:00.000Z",
  },
]

describe("GenerationHistory", () => {
  it("shows the brief and the prompt of every generation", () => {
    render(<GenerationHistory generations={generations} />)

    expect(screen.getByText("Second brief.")).toBeInTheDocument()
    expect(screen.getByText("integrated_multimodal_description: second")).toBeInTheDocument()
    expect(screen.getByText("First brief.")).toBeInTheDocument()
    expect(screen.getByText("integrated_multimodal_description: first")).toBeInTheDocument()
  })

  it("keeps the order it is given", () => {
    render(<GenerationHistory generations={generations} />)

    const briefs = screen.getAllByRole("listitem").map((item) => item.textContent)
    expect(briefs[0]).toContain("Second brief.")
    expect(briefs[1]).toContain("First brief.")
  })

  it("says where earlier prompts will go when there are none", () => {
    render(<GenerationHistory generations={[]} />)

    expect(screen.getByText("Earlier prompts appear here.")).toBeInTheDocument()
  })
})
