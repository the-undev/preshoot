import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GenerationRecord, GenerationRequest } from "@renderer/lib/trpc"
import { GenerationFields } from "./generation-fields"

const request: GenerationRequest = {
  task: "fl2va",
  prompt: "integrated_multimodal_description: [Shot 1] ...",
  durationSeconds: 8.5,
  shortEdge: 768,
  aspectRatio: "16:9",
  aspectRatioName: "Landscape 16:9",
  seed: 42,
  conditions: [
    {
      type: "image",
      role: "keyframe",
      at: "first frame",
      fileName: "3-aaa.png",
      fromAsset: "Keeper",
    },
    {
      type: "image",
      role: "keyframe",
      at: "last frame",
      fileName: "4-bbb.png",
      fromAsset: "Lamp",
    },
  ],
}

const generation: GenerationRecord = {
  id: 7,
  target: "minimax-h3",
  composer: "prose",
  clipId: 1,
  clipNote: "A keeper lights the lamp.",
  fields: {},
  composition: null,
  request,
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

let written: string[]

beforeEach(() => {
  written = []
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(async (text: string) => {
        written.push(text)
      }),
    },
  })
})

describe("GenerationFields", () => {
  it("shows everything a generation needs", () => {
    render(<GenerationFields generation={generation} />)

    expect(screen.getByText("fl2va")).toBeInTheDocument()
    expect(screen.getByText("8.5")).toBeInTheDocument()
    expect(screen.getByText("16:9")).toBeInTheDocument()
    expect(screen.getByText("768")).toBeInTheDocument()
    expect(screen.getByText("42")).toBeInTheDocument()
  })

  it("names each picture by the end of the clip it anchors", () => {
    render(<GenerationFields generation={generation} />)

    expect(screen.getByText("First frame")).toBeInTheDocument()
    expect(screen.getByText("Last frame")).toBeInTheDocument()
    expect(screen.getByText("3-aaa.png")).toBeInTheDocument()
  })

  it("copies one field on its own", () => {
    render(<GenerationFields generation={generation} />)

    fireEvent.click(screen.getByRole("button", { name: "Copy Seed" }))

    expect(written).toEqual(["42"])
  })

  it("copies from anywhere on the line, not only the icon", () => {
    render(<GenerationFields generation={generation} />)

    fireEvent.click(screen.getByText("fl2va"))

    expect(written).toEqual(["fl2va"])
  })

  it("copies every field and the prompt as one block", () => {
    render(<GenerationFields generation={generation} />)

    fireEvent.click(screen.getByRole("button", { name: "Copy all" }))

    expect(written[0]).toContain("Type: fl2va")
    expect(written[0]).toContain("Duration: 8.5")
    expect(written[0]).toContain("Seed: 42")
    expect(written[0]).toContain("Prompt: integrated_multimodal_description:")
  })

  it("leaves the prompt to be shown whole below, rather than as a line", () => {
    render(<GenerationFields generation={generation} />)

    expect(screen.queryByRole("button", { name: "Copy Prompt" })).not.toBeInTheDocument()
  })

  it("says nothing for a result written before a request was kept", () => {
    const { container } = render(<GenerationFields generation={{ ...generation, request: null }} />)

    expect(container).toBeEmptyDOMElement()
  })
})
