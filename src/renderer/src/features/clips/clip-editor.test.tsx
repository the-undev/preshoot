import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ClipComposition, ShotComposition, Vocabularies } from "@renderer/lib/trpc"
import { ClipEditor } from "./clip-editor"

const vocabularies: Vocabularies = {
  cameraMotions: ["push in"],
  amplitudes: ["with small amplitude"],
  speeds: ["at slow speed"],
  transitions: ["the camera cuts to"],
  styles: ["Live-action, cinematic"],
  lightings: ["night"],
}

function shot(id: number, durationMs: number): ShotComposition {
  return {
    id,
    durationMs,
    cameraMotion: null,
    amplitude: null,
    speed: null,
    transition: null,
    lighting: null,
    things: [],
    action: `Shot ${id}`,
    dialogue: [],
    soundNote: "",
  }
}

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  style: "Live-action, cinematic",
  note: "A keeper lights the lamp.",
  musicNote: "",
  speakers: [],
  shots: [shot(11, 4500), shot(12, 3000)],
}

function renderEditor(over: Partial<React.ComponentProps<typeof ClipEditor>> = {}): {
  onGenerate: ReturnType<typeof vi.fn>
  onClipChange: ReturnType<typeof vi.fn>
  onAddShot: ReturnType<typeof vi.fn>
} {
  const onGenerate = vi.fn()
  const onClipChange = vi.fn()
  const onAddShot = vi.fn()
  render(
    <ClipEditor
      composition={composition}
      vocabularies={vocabularies}
      library={[]}
      composers={[
        { id: "prose", name: "Model prose per shot" },
        { id: "assembled", name: "Assembled without the model" },
      ]}
      composerId="prose"
      variants={[
        {
          id: "builtin:minimax-h3:prose",
          targetId: "minimax-h3",
          strategy: "prose",
          name: "Built-in, prose per shot",
          systemPrompt: "You write the prose of each shot.",
          editable: false,
        },
      ]}
      variantId={null}
      isSaving={false}
      isGenerating={false}
      hasModel={true}
      canRegenerate={false}
      onClipChange={onClipChange}
      onAddShot={onAddShot}
      onShotChange={vi.fn()}
      onMoveShot={vi.fn()}
      onRemoveShot={vi.fn()}
      onAddSpeaker={vi.fn()}
      onUpdateSpeaker={vi.fn()}
      onRemoveSpeaker={vi.fn()}
      onChooseComposer={vi.fn()}
      onChooseVariant={vi.fn()}
      onGenerate={onGenerate}
      onRegenerateShot={vi.fn()}
      {...over}
    />
  )
  return { onGenerate, onClipChange, onAddShot }
}

describe("ClipEditor", () => {
  it("shows the clip's own fields", () => {
    renderEditor()

    expect(screen.getByLabelText("Clip")).toHaveValue("Lighthouse")
    expect(screen.getByLabelText("Style")).toHaveValue("Live-action, cinematic")
    expect(screen.getByLabelText("Note")).toHaveValue("A keeper lights the lamp.")
  })

  it("adds up the shots", () => {
    renderEditor()

    expect(screen.getByText("7.5s of 15s")).toBeInTheDocument()
  })

  it("says when the clip runs longer than a clip can", () => {
    renderEditor({
      composition: { ...composition, shots: [shot(11, 9000), shot(12, 7000)] },
    })

    expect(screen.getByText("16.0s, longer than the 15s a clip can run")).toBeInTheDocument()
  })

  it("shows every shot", () => {
    renderEditor()

    expect(screen.getByText("Shot 1")).toBeInTheDocument()
    expect(screen.getByText("Shot 2")).toBeInTheDocument()
  })

  it("reports the clip's name once the field is left", () => {
    const { onClipChange } = renderEditor()

    const name = screen.getByLabelText("Clip")
    fireEvent.change(name, { target: { value: "Lamp room" } })
    fireEvent.blur(name)

    expect(onClipChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Lamp room", style: "Live-action, cinematic" })
    )
  })

  it("asks for another shot", () => {
    const { onAddShot } = renderEditor()

    fireEvent.click(screen.getByRole("button", { name: "Add shot" }))

    expect(onAddShot).toHaveBeenCalled()
  })

  it("writes the clip the chosen way", () => {
    const { onGenerate } = renderEditor()

    expect(screen.getByLabelText("Written by")).toHaveTextContent("Model prose per shot")
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    expect(onGenerate).toHaveBeenCalled()
  })

  it("says so when no model has been chosen", () => {
    renderEditor({ hasModel: false })

    expect(
      screen.getByText("No model chosen. Open settings, press Check, and pick one.")
    ).toBeInTheDocument()
  })

  it("will not write a clip with no shots", () => {
    renderEditor({ composition: { ...composition, shots: [] } })

    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled()
  })
})
