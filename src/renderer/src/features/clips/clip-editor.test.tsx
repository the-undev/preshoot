import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type {
  ClipComposition,
  LineComposition,
  ShotComposition,
  Vocabularies,
} from "@renderer/lib/trpc"

/** One thing that happens, as the store hands it over. */
function action(id: number, text: string, subjectName: string | null = null): LineComposition {
  return {
    id,
    kind: "action",
    assetId: null,
    subjectName,
    speakerIds: [],
    text,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

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
    lines: [action(id, `Shot ${id}`)],
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
  language: "English",
  speakers: [],
  shots: [shot(11, 4500), shot(12, 3000)],
}

function renderEditor(over: Partial<React.ComponentProps<typeof ClipEditor>> = {}): {
  onAddShot: ReturnType<typeof vi.fn>
} {
  const onAddShot = vi.fn()
  render(
    <ClipEditor
      composition={composition}
      vocabularies={vocabularies}
      library={[]}
      isSaving={false}
      onAddShot={onAddShot}
      onShotChange={vi.fn()}
      onMoveShot={vi.fn()}
      onRemoveShot={vi.fn()}
      onAddSpeaker={vi.fn()}
      onUpdateSpeaker={vi.fn()}
      onRemoveSpeaker={vi.fn()}
      onAddPeople={vi.fn()}
      {...over}
    />
  )
  return { onAddShot }
}

describe("ClipEditor", () => {
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

  it("asks for another shot", () => {
    const { onAddShot } = renderEditor()

    fireEvent.click(screen.getByRole("button", { name: "Add a shot" }))

    expect(onAddShot).toHaveBeenCalled()
  })

  it("names a shot with nothing happening in it", () => {
    renderEditor({
      composition: {
        ...composition,
        shots: [{ ...composition.shots[0], lines: [action(1, "")] }],
      },
    })

    expect(screen.getByText("Shot 1 has nothing happening in it.")).toBeInTheDocument()
  })

  it("says a clip with no shots cannot be written yet", () => {
    renderEditor({ composition: { ...composition, shots: [] } })

    expect(screen.getByText("This clip has no shots.")).toBeInTheDocument()
  })
})
