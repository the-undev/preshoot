import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ClipPrompt } from "@renderer/lib/trpc"
import { ClipPromptPanel } from "./clip-prompt"

const ready: ClipPrompt = {
  ready: true,
  fields: { integrated_multimodal_description: "[Shot 1] Live-action." },
  rendered: "integrated_multimodal_description: [Shot 1] Live-action.",
  request: {
    task: "t2va",
    prompt: "integrated_multimodal_description: [Shot 1] Live-action.",
    durationSeconds: 4.5,
    shortEdge: 1080,
    aspectRatio: "16:9",
    aspectRatioName: "Widescreen",
    width: 1920,
    height: 1080,
    conditions: [],
  },
}

function renderPanel(prompt: ClipPrompt = ready): { copied: string[] } {
  const copied: string[] = []
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(async (text: string) => {
        copied.push(text)
      }),
    },
  })
  render(
    <ClipPromptPanel
      prompt={prompt}
      isExporting={false}
      exportedTo={null}
      errorMessage={null}
      onExport={vi.fn()}
      onSave={vi.fn()}
      onOpenExports={vi.fn()}
    />
  )
  return { copied }
}

describe("ClipPromptPanel", () => {
  it("gives the size in pixels rather than the short edge", () => {
    renderPanel()

    expect(screen.getByRole("button", { name: "Copy Width" })).toHaveTextContent("1920")
    expect(screen.getByRole("button", { name: "Copy Height" })).toHaveTextContent("1080")
    expect(screen.queryByRole("button", { name: "Copy Short edge" })).not.toBeInTheDocument()
  })

  it("copies the width and the height on their own", async () => {
    const { copied } = renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Copy Width" }))
    fireEvent.click(screen.getByRole("button", { name: "Copy Height" }))

    expect(copied).toEqual(["1920", "1080"])
  })

  it("says what is still missing rather than showing an empty prompt", () => {
    renderPanel({ ready: false, reason: "This clip has no shots." })

    expect(screen.getByText(/This clip has no shots/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Copy Width" })).not.toBeInTheDocument()
  })
})
