import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { listedLibrary } from "@renderer/features/library/fixtures"
import { StubTrpcProvider } from "@renderer/lib/stub-trpc"
import type {
  Asset,
  ClipComposition,
  LineComposition,
  ShotComposition,
  Vocabularies,
} from "@renderer/lib/trpc"

/** One thing that happens, as the store hands it over. */
function action(id: number, text: string, subjectIds: number[] = []): LineComposition {
  return {
    id,
    kind: "action",
    subjectIds,
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
    lines: [action(id, `Shot ${id}`)],
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
  soundscape: "",
  language: "English",
  cast: [],
  shots: [shot(11, 4500), shot(12, 3000)],
}

/** The saved subject the library's Daniel becomes. */
const savedDaniel: Asset = {
  id: 31,
  clipId: null,
  kind: "person",
  name: "Daniel",
  description: "A man in his late thirties.",
  voice: null,
  createdAt: "2026-10-16T09:00:00.000Z",
}

function renderEditor(over: Partial<React.ComponentProps<typeof ClipEditor>> = {}): {
  onAddShot: ReturnType<typeof vi.fn>
  onAddSubject: ReturnType<typeof vi.fn>
  onCreateFromLibrary: ReturnType<typeof vi.fn>
} {
  const onAddShot = vi.fn()
  const onAddSubject = vi.fn()
  const onCreateFromLibrary = vi.fn(async () => savedDaniel)
  render(
    <StubTrpcProvider answers={{ "library.entries": listedLibrary }}>
      <ClipEditor
        composition={composition}
        vocabularies={vocabularies}
        isSaving={false}
        showShot={null}
        onAddShot={onAddShot}
        onShotChange={vi.fn()}
        onMoveShot={vi.fn()}
        onMoveLine={vi.fn()}
        onRemoveShot={vi.fn()}
        onSaveShot={vi.fn()}
        savedShots={[]}
        onAddSavedShot={vi.fn()}
        saved={[]}
        speaking={[]}
        onAddSubject={onAddSubject}
        onCreateFromLibrary={onCreateFromLibrary}
        onUpdateSubject={vi.fn()}
        onSaveSubject={vi.fn()}
        onRemoveSubject={vi.fn()}
        {...over}
      />
    </StubTrpcProvider>
  )
  return { onAddShot, onAddSubject, onCreateFromLibrary }
}

/** Opens the library from the cast strip's add chip. */
function openLibraryFromCast(): void {
  fireEvent.click(screen.getByRole("button", { name: "Add a subject" }))
  fireEvent.click(screen.getByRole("button", { name: "From library" }))
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

  it("offers the library's entries with a picture, and no others", async () => {
    renderEditor()

    openLibraryFromCast()

    expect(await screen.findByRole("button", { name: "Daniel" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Rainy Street" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "one-liner" })).not.toBeInTheDocument()
  })

  it("makes a saved subject from a library entry, then adds it to the cast", async () => {
    const { onAddSubject, onCreateFromLibrary } = renderEditor()

    openLibraryFromCast()
    fireEvent.click(await screen.findByRole("button", { name: "Daniel" }))
    expect(screen.getByRole("heading", { name: "Use Daniel in this project" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "place" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use in project" })))

    expect(onCreateFromLibrary).toHaveBeenCalledWith("/l/characters/Daniel", {
      kind: "place",
      description: "A man in his late thirties.\nNavy jumper.",
    })
    expect(onAddSubject).toHaveBeenCalledWith({
      savedId: 31,
      kind: "person",
      name: "",
      description: "",
    })
    expect(onCreateFromLibrary.mock.invocationCallOrder[0]).toBeLessThan(
      onAddSubject.mock.invocationCallOrder[0]
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the library from the command menu on a line", async () => {
    renderEditor()

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: " ", ctrlKey: true })
    fireEvent.click(screen.getByRole("option", { name: "Add a subject from the library" }))

    expect(
      screen.getByRole("heading", { name: "Pick an entry from the library" })
    ).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Daniel" })).toBeInTheDocument()
  })

  it("adds nothing when the library is closed before an entry is picked", async () => {
    const { onAddSubject, onCreateFromLibrary } = renderEditor()

    openLibraryFromCast()
    await screen.findByRole("button", { name: "Daniel" })
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onCreateFromLibrary).not.toHaveBeenCalled()
    expect(onAddSubject).not.toHaveBeenCalled()
  })

  it("adds nothing when the entry's subject is cancelled", async () => {
    const { onAddSubject, onCreateFromLibrary } = renderEditor()

    openLibraryFromCast()
    fireEvent.click(await screen.findByRole("button", { name: "Daniel" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onCreateFromLibrary).not.toHaveBeenCalled()
    expect(onAddSubject).not.toHaveBeenCalled()
  })

  it("says why a subject could not be made from the library, and adds nothing", async () => {
    const { onAddSubject } = renderEditor({
      onCreateFromLibrary: vi.fn(async () => {
        throw new Error("The picture daniel-cafe.png could not be copied.")
      }),
    })

    openLibraryFromCast()
    fireEvent.click(await screen.findByRole("button", { name: "Daniel" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use in project" })))

    expect(screen.getByText("The picture daniel-cafe.png could not be copied.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Use in project" })).toBeEnabled()
    expect(onAddSubject).not.toHaveBeenCalled()
  })
})
