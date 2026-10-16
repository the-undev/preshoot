import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SavedSlotValue, WorkflowSlot } from "@renderer/lib/trpc"
import { RunForm } from "./run-form"

function slot(over: Partial<WorkflowSlot>): WorkflowSlot {
  return {
    id: 1,
    workflowId: 3,
    nodeId: 14,
    nodeType: "PrimitiveStringMultiline",
    name: "Prompt",
    kind: "text",
    tier: "basic",
    bypassed: false,
    position: 0,
    ...over,
  }
}

const slots: WorkflowSlot[] = [
  slot({}),
  slot({
    id: 2,
    nodeId: 2,
    nodeType: "Lora Loader (LoraManager)",
    name: "Your LoRAs",
    kind: "lora",
  }),
  slot({ id: 3, nodeId: 4, nodeType: "PrimitiveBoolean", name: "Turbo", kind: "boolean" }),
  slot({ id: 4, nodeId: 10, nodeType: "LoadImage", name: "Picture 1", kind: "image" }),
  slot({
    id: 5,
    nodeId: 12,
    nodeType: "LoadImage",
    name: "Picture 3",
    kind: "image",
    tier: "advanced",
    bypassed: true,
  }),
  slot({ id: 6, nodeId: 20, nodeType: "PrimitiveInt", name: "Steps", kind: "integer" }),
  slot({ id: 7, nodeId: 23, nodeType: "RandomNoise", name: "Seed", kind: "seed" }),
  slot({
    id: 8,
    nodeId: 18,
    nodeType: "PrimitiveFloat",
    name: "Duration (s)",
    kind: "number",
    tier: "hidden",
  }),
]

const savedValues: SavedSlotValue[] = [
  { slotId: 1, value: "A man at a window." },
  { slotId: 2, value: null },
  { slotId: 3, value: false },
  { slotId: 4, value: "Qwen-Image-2512_00003_.png" },
  { slotId: 5, value: "Qwen-Image-2512_00004_.png" },
  { slotId: 6, value: 20 },
  { slotId: 7, value: 757358688076805 },
  { slotId: 8, value: 5 },
]

function renderForm(over: Partial<Parameters<typeof RunForm>[0]> = {}): {
  onQueue: ReturnType<typeof vi.fn>
} {
  const onQueue = vi.fn()
  render(
    <RunForm
      slots={slots}
      savedValues={savedValues}
      blockedReason={null}
      isQueueing={false}
      onQueue={onQueue}
      onPickFile={async () => null}
      {...over}
    />
  )
  return { onQueue }
}

describe("RunForm", () => {
  it("starts from the values saved in the graph", () => {
    renderForm()

    expect(screen.getByLabelText("Prompt")).toHaveValue("A man at a window.")
    expect(screen.getByLabelText("Steps")).toHaveValue("20")
    expect(screen.getByLabelText("Seed")).toHaveValue("757358688076805")
    expect(screen.getByLabelText("Turbo")).toHaveAttribute("aria-checked", "false")
    expect(screen.getByText("Qwen-Image-2512_00003_.png")).toBeInTheDocument()
    expect(screen.getByText("As saved in the workflow.")).toBeInTheDocument()
  })

  it("keeps advanced slots behind a fold and leaves hidden ones out", () => {
    renderForm()

    expect(screen.queryByText("Picture 3")).not.toBeInTheDocument()
    expect(screen.queryByText("Duration (s)")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Advanced (1)" }))
    expect(screen.getByText("Picture 3")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Use Picture 3" })).toHaveAttribute(
      "aria-checked",
      "false"
    )
  })

  it("sends every slot as it stands when queued unchanged", () => {
    const { onQueue } = renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Queue" }))

    expect(onQueue).toHaveBeenCalledWith([
      { slotId: 1, on: true, value: { type: "value", value: "A man at a window." } },
      { slotId: 2, on: true, value: null },
      { slotId: 3, on: true, value: { type: "value", value: false } },
      { slotId: 4, on: true, value: { type: "value", value: "Qwen-Image-2512_00003_.png" } },
      { slotId: 5, on: false, value: { type: "value", value: "Qwen-Image-2512_00004_.png" } },
      { slotId: 6, on: true, value: { type: "value", value: 20 } },
      { slotId: 7, on: true, value: { type: "value", value: 757358688076805 } },
      { slotId: 8, on: true, value: { type: "value", value: 5 } },
    ])
  })

  it("sends what was typed, switched and chosen", async () => {
    const onPickFile = vi.fn(async () => "/home/me/pictures/anna.png")
    const { onQueue } = renderForm({ onPickFile })

    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "She turns." } })
    fireEvent.change(screen.getByLabelText("Steps"), { target: { value: "8" } })
    fireEvent.click(screen.getByLabelText("Turbo"))
    fireEvent.click(screen.getByRole("button", { name: "Advanced (1)" }))
    fireEvent.click(screen.getByRole("switch", { name: "Use Picture 3" }))
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Choose file for Picture 3" }))
    )
    fireEvent.click(screen.getByRole("button", { name: "Queue" }))

    expect(onPickFile).toHaveBeenCalledWith("image")
    expect(screen.getByText("anna.png")).toBeInTheDocument()
    const bindings = onQueue.mock.calls[0][0]
    expect(bindings[0]).toEqual({
      slotId: 1,
      on: true,
      value: { type: "value", value: "She turns." },
    })
    expect(bindings[2]).toEqual({ slotId: 3, on: true, value: { type: "value", value: true } })
    expect(bindings[4]).toEqual({
      slotId: 5,
      on: true,
      value: { type: "file", path: "/home/me/pictures/anna.png" },
    })
    expect(bindings[5]).toEqual({ slotId: 6, on: true, value: { type: "value", value: 8 } })
  })

  it("puts a new seed in the field when asked to randomise", () => {
    renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Randomise" }))

    const seed = screen.getByLabelText("Seed") as HTMLInputElement
    expect(seed.value).not.toBe("757358688076805")
    expect(seed.value).toMatch(/^\d+$/)
  })

  it("will not queue a number slot holding something else, and says why", () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Steps"), { target: { value: "eight" } })

    expect(screen.getByRole("button", { name: "Queue" })).toBeDisabled()
    expect(screen.getByText("Steps needs a whole number.")).toBeInTheDocument()
  })

  it("will not queue while ComfyUI does not answer, and says why", () => {
    renderForm({ blockedReason: "ComfyUI does not answer at http://127.0.0.1:8188." })

    expect(screen.getByRole("button", { name: "Queue" })).toBeDisabled()
    expect(
      screen.getByText("ComfyUI does not answer at http://127.0.0.1:8188.")
    ).toBeInTheDocument()
  })
})
