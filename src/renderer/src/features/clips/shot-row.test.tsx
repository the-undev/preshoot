import { DndContext } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type {
  LineComposition,
  ShotComposition,
  SubjectComposition,
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

import { ShotRow } from "./shot-row"

const vocabularies: Vocabularies = {
  cameraMotions: ["push in", "pan left"],
  amplitudes: ["with small amplitude"],
  speeds: ["at slow speed"],
  transitions: ["the camera cuts to", "the shot cuts to"],
  styles: ["Live-action"],
  lightings: ["night"],
}

const menu = {
  vocabularies,
  savedShots: [],
  savedSubjects: [],
  onAddSavedShot: vi.fn(),
  onAddSavedSubject: vi.fn(),
  onAddSubject: vi.fn(),
  onNewShot: vi.fn(),
}

const subjects: SubjectComposition[] = [
  { id: 5, kind: "person", name: "Keeper", description: "an elderly man", voice: null },
]

const shot: ShotComposition = {
  id: 11,
  durationMs: 4500,
  cameraMotion: "push in",
  amplitude: null,
  speed: null,
  transition: null,
  lighting: null,
  lines: [action(21, "climbs the last steps")],
}

function renderRow(
  over: Partial<React.ComponentProps<typeof ShotRow>> = {}
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn()
  render(
    <DndContext>
      <SortableContext items={["shot:11"]}>
        <ShotRow
          shot={shot}
          index={0}
          subjects={subjects}
          speakers={[]}
          vocabularies={vocabularies}
          showing={false}
          menu={menu}
          onChange={onChange}
          onRemove={vi.fn()}
          onSave={vi.fn()}
          {...over}
        />
      </SortableContext>
    </DndContext>
  )
  return onChange
}

describe("ShotRow", () => {
  it("says what a line is above it, so the box below runs the full width", () => {
    renderRow()

    expect(screen.getByLabelText("What line 1 is")).toHaveTextContent("Action")
  })

  it("shows the shot's number, length and what happens in it", () => {
    renderRow()

    expect(screen.getByText("Shot 1")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Length of shot 11" })).toHaveTextContent("4.5s")
    expect(screen.getByLabelText("Line 1 of shot 11")).toHaveValue("climbs the last steps")
  })

  it("reports the whole shot once the length box is left", () => {
    const onChange = renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Length of shot 11" }))
    const seconds = screen.getByLabelText("Seconds")
    fireEvent.change(seconds, { target: { value: "6" } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.blur(seconds)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 6000, cameraMotion: "push in" })
    )
  })

  it("keeps the length it had when the box is emptied", () => {
    const onChange = renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Length of shot 11" }))
    const seconds = screen.getByLabelText("Seconds")
    fireEvent.change(seconds, { target: { value: "" } })
    fireEvent.blur(seconds)

    expect(onChange).not.toHaveBeenCalled()
    expect(seconds).toHaveValue(4.5)
  })

  it("reports what happens once the line is left", () => {
    const onChange = renderRow()

    const line = screen.getByLabelText("Line 1 of shot 11")
    fireEvent.change(line, { target: { value: "reaches for the lamp" } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.blur(line)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ kind: "action", text: "reaches for the lamp" })],
      })
    )
  })

  it("adds what happens next, after what happens first", () => {
    const onChange = renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Add a line after line 1" }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({ text: "climbs the last steps" }),
          expect.objectContaining({ kind: "action", text: "" }),
        ],
      })
    )
  })

  it("offers no cut on the first shot", () => {
    renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Set more about shot 1" }))

    expect(screen.queryByRole("button", { name: "Cut of shot 11" })).not.toBeInTheDocument()
  })

  it("offers a cut on a later shot", () => {
    renderRow({ index: 1 })

    fireEvent.click(screen.getByRole("button", { name: /Shot 2/ }))
    fireEvent.click(screen.getByRole("button", { name: "Set more about shot 2" }))

    expect(screen.getByRole("button", { name: "Cut of shot 11" })).toBeInTheDocument()
  })

  it("opens on the first shot and folds the rest away", () => {
    renderRow({ index: 1 })

    expect(screen.queryByLabelText("Line 1 of shot 11")).not.toBeInTheDocument()
    expect(screen.getByText(/4.5s · push in · climbs the last steps/)).toBeInTheDocument()
  })

  it("folds a shot away and opens it again", () => {
    renderRow()

    fireEvent.click(screen.getByRole("button", { name: /Shot 1/ }))
    expect(screen.queryByLabelText("Line 1 of shot 11")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Shot 1/ }))
    expect(screen.getByLabelText("Line 1 of shot 11")).toBeInTheDocument()
  })

  it("offers a handle for dragging it into another place", () => {
    renderRow()

    expect(screen.getByRole("button", { name: "Reorder shot 1" })).toBeInTheDocument()
  })

  it("offers nothing to modify the camera with while it has no move", () => {
    renderRow({ shot: { ...shot, cameraMotion: null } })

    fireEvent.click(screen.getByRole("button", { name: "Set more about shot 1" }))

    expect(screen.queryByRole("button", { name: "Speed of shot 11" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Amplitude of shot 11" })).not.toBeInTheDocument()
  })

  it("offers the amplitude and the speed once the camera has a move to modify", () => {
    renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Set more about shot 1" }))

    expect(screen.getByRole("button", { name: "Speed of shot 11" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Amplitude of shot 11" })).toBeInTheDocument()
  })

  it("keeps a speed already set in reach, so it can be taken back out", () => {
    renderRow({ shot: { ...shot, cameraMotion: null, speed: "at slow speed" } })

    expect(screen.getByRole("button", { name: "Speed of shot 11" })).toHaveTextContent("slow speed")
  })

  it("keeps what has not been set out of the way until the plus is pressed", () => {
    renderRow()

    expect(screen.queryByRole("button", { name: "Lighting of shot 11" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Set more about shot 1" }))

    expect(screen.getByRole("button", { name: "Lighting of shot 11" })).toBeInTheDocument()
  })

  it("shows what has been set as a chip, and writes what is picked from it", () => {
    const onChange = renderRow()

    const camera = screen.getByRole("button", { name: "Camera of shot 11" })
    expect(camera).toHaveTextContent("push in")
    fireEvent.click(camera)
    fireEvent.click(screen.getByRole("button", { name: "pan left" }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cameraMotion: "pan left" }))
  })

  it("takes a word back off a chip", () => {
    const onChange = renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Camera of shot 11" }))
    fireEvent.click(screen.getByRole("button", { name: "Not set" }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cameraMotion: null }))
  })

  it("opens a shot that was just added and puts the cursor in it", () => {
    renderRow({ index: 1, showing: true })

    expect(screen.getByLabelText("Line 1 of shot 11")).toBeInTheDocument()
    expect(screen.getByLabelText("Line 1 of shot 11")).toHaveFocus()
  })

  it("leaves a later shot folded away when it was not the one just added", () => {
    renderRow({ index: 1 })

    expect(screen.queryByLabelText("Line 1 of shot 11")).not.toBeInTheDocument()
  })
})
