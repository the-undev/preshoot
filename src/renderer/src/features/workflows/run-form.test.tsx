import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { LibraryFolder, RunBinding, SavedSlotValue, WorkflowSlot } from "@renderer/lib/trpc"
import { listedLibrary } from "@renderer/features/library/fixtures"
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
  onSaveNew: ReturnType<typeof vi.fn>
  onUpdate: ReturnType<typeof vi.fn>
} {
  const onQueue = vi.fn()
  const onSaveNew = vi.fn(async () => {})
  const onUpdate = vi.fn(async () => {})
  render(
    <RunForm
      slots={slots}
      savedValues={savedValues}
      initialBindings={[]}
      keptFields={null}
      onFieldsChange={() => {}}
      configurationName={null}
      blockedReason={null}
      isQueueing={false}
      onQueue={onQueue}
      onSaveNew={onSaveNew}
      onUpdate={onUpdate}
      onPickFile={async () => null}
      library={listedLibrary}
      {...over}
    />
  )
  return { onQueue, onSaveNew, onUpdate }
}

/** What the form sends for the saved values, unchanged. */
const unchangedBindings: RunBinding[] = [
  { slotId: 1, on: true, value: { type: "value", value: "A man at a window." } },
  { slotId: 2, on: true, value: null },
  { slotId: 3, on: true, value: { type: "value", value: false } },
  { slotId: 4, on: true, value: { type: "value", value: "Qwen-Image-2512_00003_.png" } },
  { slotId: 5, on: false, value: { type: "value", value: "Qwen-Image-2512_00004_.png" } },
  { slotId: 6, on: true, value: { type: "value", value: 20 } },
  { slotId: 7, on: true, value: { type: "value", value: 757358688076805 } },
  { slotId: 8, on: true, value: { type: "value", value: 5 } },
]

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

    expect(onQueue).toHaveBeenCalledWith(unchangedBindings, 1)
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

  it("queues as many runs as the number beside Queue says", () => {
    const { onQueue } = renderForm()

    fireEvent.change(screen.getByLabelText("Number of runs"), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: "Queue" }))

    expect(onQueue).toHaveBeenCalledWith(unchangedBindings, 5)
  })

  it("will not queue a number of runs outside one to twenty, and says why", () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Number of runs"), { target: { value: "21" } })

    expect(screen.getByRole("button", { name: "Queue" })).toBeDisabled()
    expect(
      screen.getByText("The number of runs is a whole number from 1 to 20.")
    ).toBeInTheDocument()
  })

  it("starts from a loaded configuration's values where it gives them", () => {
    const { onQueue } = renderForm({
      initialBindings: [
        { slotId: 1, on: true, value: { type: "value", value: "From the configuration." } },
        { slotId: 3, on: true, value: { type: "value", value: true } },
        { slotId: 4, on: true, value: { type: "file", path: "/film/inputs/anna.png" } },
        { slotId: 5, on: true, value: { type: "value", value: "Qwen-Image-2512_00004_.png" } },
      ],
    })

    expect(screen.getByLabelText("Prompt")).toHaveValue("From the configuration.")
    expect(screen.getByLabelText("Turbo")).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("anna.png")).toBeInTheDocument()
    expect(screen.getByLabelText("Steps")).toHaveValue("20")
    fireEvent.click(screen.getByRole("button", { name: "Queue" }))
    const bindings = onQueue.mock.calls[0][0]
    expect(bindings[3]).toEqual({
      slotId: 4,
      on: true,
      value: { type: "file", path: "/film/inputs/anna.png" },
    })
    expect(bindings[4]).toEqual({
      slotId: 5,
      on: true,
      value: { type: "value", value: "Qwen-Image-2512_00004_.png" },
    })
  })

  it("saves the form's values under the name given", async () => {
    const { onSaveNew } = renderForm()

    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "She turns." } })
    fireEvent.click(screen.getByRole("button", { name: "Save as configuration" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).queryByRole("button", { name: /Update/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: " Anna " } })
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Save" })))

    expect(onSaveNew).toHaveBeenCalledWith("Anna", [
      { slotId: 1, on: true, value: { type: "value", value: "She turns." } },
      ...unchangedBindings.slice(1),
    ])
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("offers to update the loaded configuration as well as to save a new one", async () => {
    const { onSaveNew, onUpdate } = renderForm({ configurationName: "Anna" })

    fireEvent.click(screen.getByRole("button", { name: "Save as configuration" }))
    await act(async () =>
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Update Anna" })
      )
    )
    expect(onUpdate).toHaveBeenCalledWith(unchangedBindings)
    expect(onSaveNew).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Save as configuration" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Anna, dusk" } })
    await act(async () =>
      fireEvent.click(within(dialog).getByRole("button", { name: "Save as new" }))
    )
    expect(onSaveNew).toHaveBeenCalledWith("Anna, dusk", unchangedBindings)
  })

  it("keeps the dialog open with the reason when saving fails", async () => {
    renderForm({
      onSaveNew: async () => {
        throw new Error("/pictures/anna.png could not be copied in.")
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Save as configuration" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Anna" } })
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Save" })))

    expect(
      within(screen.getByRole("dialog")).getByText("/pictures/anna.png could not be copied in.")
    ).toBeInTheDocument()
  })

  it("will not save a form holding a value its slot does not take", () => {
    renderForm()

    fireEvent.change(screen.getByLabelText("Steps"), { target: { value: "eight" } })

    expect(screen.getByRole("button", { name: "Save as configuration" })).toBeDisabled()
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

  it("binds a picture picked from the library the way a file picked from disk is bound", () => {
    const { onQueue } = renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Choose Picture 1 from the library" }))
    fireEvent.click(screen.getByRole("button", { name: "Rainy Street: rainy-street-dusk.png" }))
    fireEvent.click(screen.getByRole("button", { name: "Queue" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByText("rainy-street-dusk.png")).toBeInTheDocument()
    expect(onQueue.mock.calls[0][0][3]).toEqual({
      slotId: 4,
      on: true,
      value: { type: "file", path: "/l/scenes/Rainy Street/rainy-street-dusk.png" },
    })
  })

  it("shows a thumbnail beside a picture picked from the library", () => {
    renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Choose Picture 1 from the library" }))
    fireEvent.click(screen.getByRole("button", { name: "Rainy Street: rainy-street-dusk.png" }))

    const slotRow = screen.getByText("Picture 1").closest("li")
    const thumbnails = slotRow?.querySelectorAll("img") ?? []
    expect(thumbnails).toHaveLength(1)
    expect(thumbnails[0]).toHaveAttribute(
      "src",
      `library://file/${encodeURIComponent("scenes/Rainy Street/rainy-street-dusk.png")}?width=80`
    )
  })

  it("shows no thumbnail for a file picked from disk, or for the one saved in the workflow", async () => {
    renderForm({ onPickFile: async () => "/home/me/pictures/anna.png" })
    const slotRow = screen.getByText("Picture 1").closest("li")
    expect(slotRow?.querySelector("img")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Choose Picture 1 from the library" }))
    fireEvent.click(screen.getByRole("button", { name: "Rainy Street: rainy-street-dusk.png" }))
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Choose file for Picture 1" }))
    )

    expect(screen.getByText("anna.png")).toBeInTheDocument()
    expect(slotRow?.querySelector("img")).toBeNull()
  })

  it("offers the library's pictures by entry, and only pictures", () => {
    renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Choose Picture 1 from the library" }))

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("heading", { name: /Daniel/ })).toBeInTheDocument()
    expect(within(dialog).getByRole("heading", { name: /Rainy Street/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole("heading", { name: /one-liner/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: /voice\.wav/ })).not.toBeInTheDocument()
  })

  it("says so in the picker when no library folder is set", () => {
    const unset: LibraryFolder = { state: "unset" }
    renderForm({ library: unset })

    fireEvent.click(screen.getByRole("button", { name: "Choose Picture 1 from the library" }))

    expect(screen.getByText(/No library folder is set/)).toBeInTheDocument()
  })

  it("offers the library only for picture slots", () => {
    renderForm({
      slots: [slot({ id: 9, nodeId: 30, nodeType: "LoadAudio", name: "Voice", kind: "audio" })],
      savedValues: [],
    })

    expect(screen.getByRole("button", { name: "Choose file for Voice" })).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Choose Voice from the library" })
    ).not.toBeInTheDocument()
  })
})
