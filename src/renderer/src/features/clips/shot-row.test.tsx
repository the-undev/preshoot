import { DndContext } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Asset, LineComposition, ShotComposition, Vocabularies } from "@renderer/lib/trpc"

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

const library: Asset[] = [
  {
    id: 5,
    clipId: null,
    kind: "person",
    name: "Keeper",
    description: "an elderly man",
    voice: null,
    createdAt: "2026-09-12T08:00:00.000Z",
  },
]

const shot: ShotComposition = {
  id: 11,
  durationMs: 4500,
  cameraMotion: "push in",
  amplitude: null,
  speed: null,
  transition: null,
  lighting: null,
  things: [],
  lines: [action(21, "climbs the last steps")],
  soundNote: "",
}

function renderRow(over: Partial<React.ComponentProps<typeof ShotRow>> = {}): {
  onChange: ReturnType<typeof vi.fn>
  onAddPeople: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  const onAddPeople = vi.fn()
  render(
    <DndContext>
      <SortableContext items={[11]}>
        <ShotRow
          shot={shot}
          index={0}
          speakers={[]}
          library={library}
          vocabularies={vocabularies}
          onChange={onChange}
          onRemove={vi.fn()}
          onAddPeople={onAddPeople}
          {...over}
        />
      </SortableContext>
    </DndContext>
  )
  return { onChange, onAddPeople }
}

describe("ShotRow", () => {
  it("shows the shot's number, length and what happens in it", () => {
    renderRow()

    expect(screen.getByText("Shot 1")).toBeInTheDocument()
    expect(screen.getByLabelText("Seconds")).toHaveValue(4.5)
    expect(screen.getByLabelText("Line 1 of shot 11")).toHaveValue("climbs the last steps")
  })

  it("reports the whole shot once the length box is left", () => {
    const { onChange } = renderRow()

    const seconds = screen.getByLabelText("Seconds")
    fireEvent.change(seconds, { target: { value: "6" } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.blur(seconds)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 6000, cameraMotion: "push in", things: [] })
    )
  })

  it("keeps the length it had when the box is emptied", () => {
    const { onChange } = renderRow()

    const seconds = screen.getByLabelText("Seconds")
    fireEvent.change(seconds, { target: { value: "" } })
    fireEvent.blur(seconds)

    expect(onChange).not.toHaveBeenCalled()
    expect(seconds).toHaveValue(4.5)
  })

  it("reports what happens once the line is left", () => {
    const { onChange } = renderRow()

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
    const { onChange } = renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Add something that happens" }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({ text: "climbs the last steps" }),
          expect.objectContaining({ kind: "action", text: "" }),
        ],
      })
    )
  })

  it("offers no transition on the first shot", () => {
    renderRow()

    expect(screen.queryByLabelText("Cut into it with")).not.toBeInTheDocument()
  })

  it("offers a transition on a later shot", () => {
    renderRow({ index: 1 })

    fireEvent.click(screen.getByRole("button", { name: /Shot 2/ }))

    expect(screen.getByLabelText("Cut into it with")).toBeInTheDocument()
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

  it("adds a library thing to what the shot shows", () => {
    const { onChange } = renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Keeper" }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ things: [5] }))
  })

  it("takes a library thing away again", () => {
    const { onChange } = renderRow({
      shot: {
        ...shot,
        things: [{ id: 5, kind: "person", name: "Keeper", description: "x", voice: null }],
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Keeper" }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ things: [] }))
  })

  it("says where people come from, and offers to go there", () => {
    const { onAddPeople } = renderRow({ library: [] })

    expect(
      screen.getByText(/The people, places and objects a shot holds live in the library/)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open the library" }))

    expect(onAddPeople).toHaveBeenCalled()
  })

  it("offers a line of dialogue only once the clip has a speaker", () => {
    renderRow()

    expect(screen.getByRole("button", { name: "Add a line of dialogue" })).toBeDisabled()
  })
})
