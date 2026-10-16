import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { takeClipTransfer } from "@renderer/features/workflows/clip-transfer"
import { StubTrpcProvider, type StubAnswers } from "@renderer/lib/stub-trpc"
import type {
  ClipPrompt,
  GenerationRequest,
  ShownSlot,
  WorkflowShownSlots,
} from "@renderer/lib/trpc"
import { ClipPromptPanel } from "./clip-prompt"

const request: GenerationRequest = {
  task: "fl2va",
  prompt: "integrated_multimodal_description: [Shot 1] Live-action.",
  durationSeconds: 4.5,
  shortEdge: 1080,
  aspectRatio: "16:9",
  aspectRatioName: "Widescreen",
  width: 1920,
  height: 1080,
  conditions: [
    {
      type: "image",
      role: "keyframe",
      at: "first frame",
      fileName: "3-aaa.png",
      imageId: 3,
      fromAsset: "Keeper",
    },
    {
      type: "image",
      role: "keyframe",
      at: "last frame",
      fileName: "4-bbb.png",
      imageId: 4,
      fromAsset: "Lighthouse",
    },
  ],
}

const ready: ClipPrompt = {
  ready: true,
  fields: { integrated_multimodal_description: "[Shot 1] Live-action." },
  rendered: "integrated_multimodal_description: [Shot 1] Live-action.",
  request,
  body: { words: 92, min: 350, max: 500 },
}

/** The same clip without a first or last frame. */
const unframed: ClipPrompt = { ...ready, request: { ...request, task: "t2va", conditions: [] } }

function slot(over: Partial<ShownSlot>): ShownSlot {
  return {
    id: 1,
    name: "Prompt",
    displayName: null,
    kind: "text",
    tier: "basic",
    multiline: true,
    ...over,
  }
}

function workflow(id: number, name: string, slots: ShownSlot[]): WorkflowShownSlots {
  return { id, name, slots }
}

/** The project's workflows with the slots their forms show, in graph order. */
const workflows: WorkflowShownSlots[] = [
  workflow(3, "h3-fl2v-base", [
    slot({ id: 9, name: "Steps", kind: "integer", multiline: false }),
    slot({ id: 10, name: "First frame", kind: "image", multiline: false }),
    slot({ id: 11, name: "Last frame", kind: "image", multiline: false, tier: "advanced" }),
    slot({ id: 12, name: "Negative", multiline: false }),
    slot({ id: 13, name: "Style", tier: "advanced" }),
    slot({ id: 14, name: "Prompt" }),
    slot({ id: 16, name: "Duration (s)", kind: "number", multiline: false }),
    slot({ id: 20, name: "Seed", kind: "seed", multiline: false }),
  ]),
  // One shows only a seed and one shows nothing, so neither shows a text slot.
  workflow(4, "qwen-image-seed", [slot({ id: 30, name: "Seed", kind: "seed", multiline: false })]),
  workflow(5, "qwen-image-hidden", []),
  workflow(6, "qwen-image-edit", [
    slot({ id: 40, name: "Instruction" }),
    slot({ id: 41, name: "Picture", kind: "image", multiline: false }),
  ]),
]

/** Answers the send dialog's calls: the workflows given, and a path for each picture. */
function sendAnswers(shown: WorkflowShownSlots[]): StubAnswers {
  return {
    "workflows.shownSlots": shown,
    "assets.picturePath": ({ imageId }: { imageId: number }) =>
      `/film/assets/images/${imageId}-picture.png`,
  }
}

interface Rendered {
  copied: string[]
  onOpenWorkflow: ReturnType<typeof vi.fn>
  onOpenWorkflows: ReturnType<typeof vi.fn>
}

function renderPanel(
  prompt: ClipPrompt = ready,
  answers: StubAnswers = sendAnswers(workflows)
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

/** Opens the send dialog and picks the workflow named, which shows its mapping step. */
async function pickWorkflow(workflowName: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))
  const row = await screen.findByRole("listitem", { name: workflowName })
  fireEvent.click(within(row).getByRole("button"))
}

/** The slot a piece's row is set to, as the row shows it. */
function choiceOf(piece: string): string {
  return screen.getByRole("combobox", { name: piece }).textContent ?? ""
}

/** Sets a piece's row to the slot named, or to Not sent. */
function choose(piece: string, option: string): void {
  fireEvent.click(screen.getByRole("combobox", { name: piece }))
  fireEvent.click(screen.getByRole("option", { name: option }))
}

/** What a piece's row offers, in order, leaving the row as it was. */
function optionsOf(piece: string): string[] {
  const current = choiceOf(piece)
  fireEvent.click(screen.getByRole("combobox", { name: piece }))
  const names = screen.getAllByRole("option").map((option) => option.textContent ?? "")
  fireEvent.click(screen.getByRole("option", { name: current }))
  return names
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

  it("lists the workflows with a text slot in their form", async () => {
    renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))

    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByRole("listitem", { name: "h3-fl2v-base" })
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("aria-label"))
    ).toEqual(["h3-fl2v-base", "qwen-image-edit"])
  })

  it("starts each piece on the slot named for it, the prompt on the prompt box", async () => {
    renderPanel()

    await pickWorkflow("h3-fl2v-base")

    expect(choiceOf("Prompt")).toBe("Prompt")
    expect(choiceOf("Duration")).toBe("Duration (s)")
    expect(choiceOf("First frame")).toBe("First frame")
    expect(choiceOf("Last frame")).toBe("Last frame")
    expect(screen.getByText("4.5 seconds")).toBeInTheDocument()
    expect(screen.getByText("3-aaa.png, from Keeper")).toBeInTheDocument()
  })

  it("offers each piece the slots that take it, the prompt with no Not sent", async () => {
    renderPanel()

    await pickWorkflow("h3-fl2v-base")

    expect(optionsOf("Prompt")).toEqual(["Prompt", "Negative", "Style"])
    expect(optionsOf("Duration")).toEqual(["Steps", "Duration (s)", "Not sent"])
    expect(optionsOf("First frame")).toEqual(["First frame", "Last frame", "Not sent"])
  })

  it("starts a piece on Not sent when no slot is named for it", async () => {
    renderPanel()

    await pickWorkflow("qwen-image-edit")

    expect(choiceOf("Prompt")).toBe("Instruction")
    expect(choiceOf("Duration")).toBe("Not sent")
    expect(choiceOf("First frame")).toBe("Not sent")
    expect(optionsOf("Duration")).toEqual(["Not sent"])
    expect(optionsOf("First frame")).toEqual(["Picture", "Not sent"])
  })

  it("matches a display name for the slot a piece starts on, and offers slots by it", async () => {
    renderPanel(
      unframed,
      sendAnswers([
        workflow(3, "h3-fl2v-base", [
          slot({ id: 14, name: "Prompt", displayName: "Scene" }),
          slot({ id: 16, name: "Float", displayName: "Clip duration", kind: "number" }),
        ]),
      ])
    )

    await pickWorkflow("h3-fl2v-base")

    expect(choiceOf("Prompt")).toBe("Scene")
    expect(choiceOf("Duration")).toBe("Clip duration")
  })

  it("shows no picture rows for a clip with no first or last frame", async () => {
    renderPanel(unframed)

    await pickWorkflow("h3-fl2v-base")

    expect(screen.getAllByRole("combobox").map((row) => row.getAttribute("id"))).toEqual([
      "send-piece-prompt",
      "send-piece-duration",
    ])
  })

  it("will not send two pieces to the same slot, and says why", async () => {
    renderPanel()
    await pickWorkflow("h3-fl2v-base")

    choose("Last frame", "First frame")

    expect(screen.getByText(/Two pieces go to the same slot/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
    choose("Last frame", "Not sent")
    expect(screen.queryByText(/Two pieces go to the same slot/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled()
  })

  it("sends each piece to its slot with the picture paths read, leaving out what is not sent", async () => {
    const { onOpenWorkflow } = renderPanel()
    await pickWorkflow("h3-fl2v-base")
    choose("Prompt", "Style")
    choose("Duration", "Not sent")

    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() => expect(onOpenWorkflow).toHaveBeenCalledWith(3))
    expect(takeClipTransfer(3)).toEqual({
      workflowId: 3,
      clipName: "Anna at the window",
      values: [
        {
          slotId: 13,
          value: { type: "text", text: "integrated_multimodal_description: [Shot 1] Live-action." },
        },
        { slotId: 10, value: { type: "file", path: "/film/assets/images/3-picture.png" } },
        { slotId: 11, value: { type: "file", path: "/film/assets/images/4-picture.png" } },
      ],
    })
  })

  it("sends the duration as a number", async () => {
    const { onOpenWorkflow } = renderPanel(unframed)
    await pickWorkflow("h3-fl2v-base")

    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() => expect(onOpenWorkflow).toHaveBeenCalledWith(3))
    expect(takeClipTransfer(3)?.values).toEqual([
      {
        slotId: 14,
        value: { type: "text", text: "integrated_multimodal_description: [Shot 1] Live-action." },
      },
      { slotId: 16, value: { type: "number", value: 4.5 } },
    ])
  })

  it("says why and sends nothing when a picture's path cannot be read", async () => {
    const { onOpenWorkflow } = renderPanel(ready, { "workflows.shownSlots": workflows })
    await pickWorkflow("h3-fl2v-base")

    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(
      await screen.findByText("Nothing was sent. Nothing answers assets.picturePath.")
    ).toBeInTheDocument()
    expect(onOpenWorkflow).not.toHaveBeenCalled()
    expect(takeClipTransfer(3)).toBeNull()
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled()
  })

  it("goes back to the workflows from the mapping step", async () => {
    renderPanel()
    await pickWorkflow("h3-fl2v-base")

    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    expect(screen.getByRole("listitem", { name: "qwen-image-edit" })).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Prompt" })).not.toBeInTheDocument()
  })

  it("points to the Workflows page when the project has no workflows", async () => {
    const { onOpenWorkflows } = renderPanel(ready, sendAnswers([]))
    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))

    expect(await screen.findByText(/This project has no workflows yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Workflows" }))
    expect(onOpenWorkflows).toHaveBeenCalled()
  })

  it("says why none is offered when no workflow has a text slot in its form", async () => {
    renderPanel(ready, sendAnswers(workflows.slice(1, 3)))
    fireEvent.click(screen.getByRole("button", { name: "Send to workflow" }))

    expect(
      await screen.findByText(/None of this project's workflows has a text slot in its form/)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Workflows" })).toBeInTheDocument()
  })
})
