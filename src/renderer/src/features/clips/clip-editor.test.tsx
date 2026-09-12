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
  form: "t2v",
  shortEdge: 768,
  aspectRatio: "auto",
  seed: 0,
  frames: [],
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
      libraryImages={[]}
      aspectRatios={[
        { value: "auto", name: "Whatever suits (auto)" },
        { value: "16:9", name: "Landscape 16:9" },
      ]}
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
      onSetFrame={vi.fn()}
      onOpenSettings={vi.fn()}
      onAddPeople={vi.fn()}
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
    expect(screen.getByLabelText("What this clip is")).toHaveValue("A keeper lights the lamp.")
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
      screen.getByText("No model chosen. Settings hold one model for the whole app.")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument()
  })

  it("names a shot with nothing happening in it before Generate is pressed", () => {
    renderEditor({
      composition: { ...composition, shots: [{ ...composition.shots[0], action: "" }] },
    })

    expect(screen.getByText("Shot 1 has nothing happening in it.")).toBeInTheDocument()
  })

  it("writes the clip on ctrl and enter", () => {
    const { onGenerate } = renderEditor()

    fireEvent.keyDown(screen.getByLabelText("Clip"), { key: "Enter", ctrlKey: true })

    expect(onGenerate).toHaveBeenCalled()
  })

  it("says what kind of generation the clip is for", () => {
    renderEditor()

    expect(screen.getByLabelText("Generation type")).toHaveTextContent("Text to video (t2va)")
  })

  it("holds the shape, the short edge and the seed it is generated at", () => {
    renderEditor({
      composition: { ...composition, aspectRatio: "16:9", shortEdge: 1080, seed: 42 },
    })

    expect(screen.getByLabelText("Shape")).toHaveTextContent("Landscape 16:9")
    expect(screen.getByLabelText("Short edge")).toHaveValue(1080)
    expect(screen.getByLabelText("Seed")).toHaveValue(42)
  })

  it("keeps the short edge it had when the box is emptied", () => {
    const { onClipChange } = renderEditor()

    const edge = screen.getByLabelText("Short edge")
    fireEvent.change(edge, { target: { value: "" } })
    fireEvent.blur(edge)

    expect(onClipChange).not.toHaveBeenCalled()
    expect(edge).toHaveValue(768)
  })

  it("says what auto will do, which depends on the generation type", () => {
    renderEditor()
    expect(screen.getByText("The model chooses the shape.")).toBeInTheDocument()
  })

  it("says auto follows the picture when the clip has one", () => {
    renderEditor({ composition: { ...composition, form: "i2v" } })

    expect(screen.getByText("The shape follows the reference picture.")).toBeInTheDocument()
  })

  it("asks for a picture when the form needs one", () => {
    renderEditor({ composition: { ...composition, form: "i2v" } })

    expect(screen.getByLabelText("Opens on")).toBeInTheDocument()
    expect(screen.getByText("Choose the picture this clip opens on.")).toBeInTheDocument()
  })

  it("asks for nothing extra when the clip is written from text", () => {
    renderEditor()

    expect(screen.queryByLabelText("Opens on")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Generation type")).toHaveTextContent("Text to video")
  })

  it("will not write a clip with no shots", () => {
    renderEditor({ composition: { ...composition, shots: [] } })

    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled()
  })
})
