import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { takePromptTransfer } from "@renderer/features/workflows/prompt-transfer"
import { StubTrpcProvider, type StubAnswers } from "@renderer/lib/stub-trpc"
import type { ClipPrompt, TextSlot, WorkflowTextSlots } from "@renderer/lib/trpc"
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
  body: { words: 92, min: 350, max: 500 },
}

function slot(over: Partial<TextSlot>): TextSlot {
  return { id: 1, name: "Prompt", displayName: null, tier: "basic", multiline: true, ...over }
}

function workflow(id: number, name: string, slots: TextSlot[]): WorkflowTextSlots {
  return { id, name, slots }
}

/** The project's workflows with the text slots their forms show, in graph order. */
const workflows: WorkflowTextSlots[] = [
  workflow(3, "h3-r2v-base", [
    slot({ id: 10, name: "Negative", multiline: false }),
    slot({ id: 12, name: "Style", tier: "advanced" }),
    slot({ id: 13, name: "Prompt" }),
  ]),
  // One holds only a seed and one only a hidden text slot, so neither shows a text slot.
  workflow(4, "qwen-image-seed", []),
  workflow(5, "qwen-image-hidden", []),
  workflow(6, "qwen-image-edit", [slot({ id: 40, name: "Instruction" })]),
]

/** Answers the one workflow call the send dialog makes from the workflows given. */
function workflowAnswers(shown: WorkflowTextSlots[]): StubAnswers {
  return { "workflows.textSlots": shown }
}

interface Rendered {
  copied: string[]
  onOpenWorkflow: ReturnType<typeof vi.fn>
  onOpenWorkflows: ReturnType<typeof vi.fn>
}

function renderPanel(
  prompt: ClipPrompt = ready,
  answers: StubAnswers = workflowAnswers(workflows)
): Rendered {
  const copied: string[] = []
  const onOpenWorkflow = vi.fn()
  const onOpenWorkflows = vi.fn()
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(async (text: string) => {
        copied.push(text)
      }),
    },
  })
  render(
    <StubTrpcProvider answers={answers}>
      <ClipPromptPanel
        prompt={prompt}
        clipName="Anna at the window"
        isExporting={false}
        exportedTo={null}
        errorMessage={null}
        onExport={vi.fn()}
        onSave={vi.fn()}
        onOpenExports={vi.fn()}
        onOpenWorkflow={onOpenWorkflow}
        onOpenWorkflows={onOpenWorkflows}
      />
    </StubTrpcProvider>
  )
  return { copied, onOpenWorkflow, onOpenWorkflows }
}

/** The buttons in one workflow's row of the send dialog, by name. */
function choicesIn(workflowName: string): string[] {
  return within(screen.getByRole("listitem", { name: workflowName }))
    .getAllByRole("button")
    .map((button) => button.textContent ?? "")
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

  it("says how long the body came out against what the model wants", () => {
    renderPanel()

    expect(screen.getByText(/92 words, short of the 350 the model wants/)).toBeInTheDocument()
  })

  it("says nothing about the length when it is in range", () => {
    renderPanel({ ...ready, body: { words: 400, min: 350, max: 500 } } as ClipPrompt)

    expect(screen.getByText("400 words")).toBeInTheDocument()
  })

  it("says what is still missing rather than showing an empty prompt", () => {
    renderPanel({ ready: false, reason: "This clip has no shots." })

    expect(screen.getByText(/This clip has no shots/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Copy Width" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Send to workflow" })).not.toBeInTheDocument()
  })

  it("lists the workflows with a text slot in their form, prompt-sized basic slots first", async () => {
    renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))

    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByRole("listitem", { name: "h3-r2v-base" })
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("aria-label"))
        .filter((name) => name !== null)
    ).toEqual(["h3-r2v-base", "qwen-image-edit"])
    expect(choicesIn("h3-r2v-base")).toEqual(["Prompt", "Negative", "Style"])
    expect(choicesIn("qwen-image-edit")).toHaveLength(1)
  })

  it("opens the workflow picked with the prompt waiting for the slot picked", async () => {
    const { onOpenWorkflow } = renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))
    const row = await screen.findByRole("listitem", { name: "h3-r2v-base" })

    fireEvent.click(within(row).getByRole("button", { name: "Style" }))

    expect(onOpenWorkflow).toHaveBeenCalledWith(3)
    expect(takePromptTransfer(3)).toEqual({
      workflowId: 3,
      slotId: 12,
      text: "integrated_multimodal_description: [Shot 1] Live-action.",
      clipName: "Anna at the window",
    })
  })

  it("sends to a workflow's only text slot from the workflow's row", async () => {
    const { onOpenWorkflow } = renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))
    const row = await screen.findByRole("listitem", { name: "qwen-image-edit" })

    fireEvent.click(within(row).getByRole("button"))

    expect(onOpenWorkflow).toHaveBeenCalledWith(6)
    expect(takePromptTransfer(6)).toMatchObject({ workflowId: 6, slotId: 40 })
  })

  it("offers a slot by its display name where it has one", async () => {
    renderPanel(
      ready,
      workflowAnswers([
        workflow(3, "h3-r2v-base", [
          slot({ id: 13, name: "Prompt", displayName: "Scene" }),
          slot({ id: 12, name: "Style", multiline: false }),
        ]),
        workflow(6, "qwen-image-edit", [
          slot({ id: 40, name: "Instruction", displayName: "Edit" }),
        ]),
      ])
    )
    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))
    await screen.findByRole("listitem", { name: "h3-r2v-base" })

    expect(choicesIn("h3-r2v-base")).toEqual(["Scene", "Style"])
    const only = within(screen.getByRole("listitem", { name: "qwen-image-edit" })).getByRole(
      "button"
    )
    expect(within(only).getByText("Edit")).toBeInTheDocument()
    expect(within(only).queryByText("Instruction")).not.toBeInTheDocument()
  })

  it("points to the Workflows page when the project has no workflows", async () => {
    const { onOpenWorkflows } = renderPanel(ready, workflowAnswers([]))
    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))

    expect(await screen.findByText(/This project has no workflows yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Workflows" }))
    expect(onOpenWorkflows).toHaveBeenCalled()
  })

  it("says why none is offered when no workflow has a text slot in its form", async () => {
    renderPanel(ready, workflowAnswers(workflows.slice(1, 3)))
    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))

    expect(
      await screen.findByText(/None of this project's workflows has a text slot in its form/)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Workflows" })).toBeInTheDocument()
  })
})
