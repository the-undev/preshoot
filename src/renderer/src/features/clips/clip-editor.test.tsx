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
    beats: [{ subjectName: null, text: `Shot ${id}` }],
    dialogue: [],
    soundNote: "",
  }
}

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  form: "t2v",
  shortEdge: 768,
  aspectRatio: "16:9",
  frames: [],
  style: "Live-action, cinematic",
  note: "A keeper lights the lamp.",
  musicNote: "",
  speakers: [],
  shots: [shot(11, 4500), shot(12, 3000)],
}

function renderEditor(over: Partial<React.ComponentProps<typeof ClipEditor>> = {}): {
  onClipChange: ReturnType<typeof vi.fn>
  onAddShot: ReturnType<typeof vi.fn>
} {
  const onClipChange = vi.fn()
  const onAddShot = vi.fn()
  render(
    <ClipEditor
      composition={composition}
      vocabularies={vocabularies}
      library={[]}
      libraryImages={[]}
      aspectRatios={[
        { value: "16:9", name: "Widescreen", width: 16, height: 9 },
        { value: "1:1", name: "Square", width: 1, height: 1 },
        { value: "9:16", name: "Widescreen", width: 9, height: 16 },
      ]}
      isSaving={false}
      onClipChange={onClipChange}
      onAddShot={onAddShot}
      onShotChange={vi.fn()}
      onMoveShot={vi.fn()}
      onRemoveShot={vi.fn()}
      onAddSpeaker={vi.fn()}
      onUpdateSpeaker={vi.fn()}
      onRemoveSpeaker={vi.fn()}
      onSetFrame={vi.fn()}
      onAddPeople={vi.fn()}
      {...over}
    />
  )
  return { onClipChange, onAddShot }
}

describe("ClipEditor", () => {
  it("shows the clip's own fields", () => {
    renderEditor()

    expect(screen.getByLabelText("Style")).toHaveValue("Live-action, cinematic")
    expect(screen.getByLabelText("Note")).toHaveValue("A keeper lights the lamp.")
  })

  it("explains a field rather than showing an example inside it", () => {
    renderEditor()

    expect(screen.getByLabelText("Note")).not.toHaveAttribute("placeholder")
    expect(screen.getByRole("button", { name: "What the note is for" })).toBeInTheDocument()
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

  it("reports the style once the field is left", () => {
    const { onClipChange } = renderEditor()

    const style = screen.getByLabelText("Style")
    fireEvent.change(style, { target: { value: "vintage film" } })
    fireEvent.blur(style)

    expect(onClipChange).toHaveBeenCalledWith(expect.objectContaining({ style: "vintage film" }))
  })

  it("asks for another shot", () => {
    const { onAddShot } = renderEditor()

    fireEvent.click(screen.getByRole("button", { name: "Add shot" }))

    expect(onAddShot).toHaveBeenCalled()
  })

  it("names a shot with nothing happening in it", () => {
    renderEditor({
      composition: {
        ...composition,
        shots: [{ ...composition.shots[0], beats: [{ subjectName: null, text: "" }] }],
      },
    })

    expect(screen.getByText("Shot 1 has nothing happening in it.")).toBeInTheDocument()
  })

  it("says what kind of generation the clip is for", () => {
    renderEditor()

    expect(screen.getByLabelText("Generation type")).toHaveTextContent("Text to video (t2va)")
  })

  it("shows the resolution it is generated at", () => {
    renderEditor({ composition: { ...composition, aspectRatio: "16:9", shortEdge: 1080 } })

    expect(screen.getByRole("radio", { name: "16:9 Widescreen" })).toBeChecked()
    expect(screen.getByText("1920 × 1080")).toBeInTheDocument()
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

  it("says a clip with no shots cannot be written yet", () => {
    renderEditor({ composition: { ...composition, shots: [] } })

    expect(screen.getByText("This clip has no shots.")).toBeInTheDocument()
  })
})
