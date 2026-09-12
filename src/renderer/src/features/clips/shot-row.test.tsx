import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Asset, ShotComposition, Vocabularies } from "@renderer/lib/trpc"
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
    kind: "person",
    name: "Keeper",
    description: "an elderly man",
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
  action: "climbs the last steps",
  dialogue: [],
  soundNote: "",
}

function renderRow(over: Partial<React.ComponentProps<typeof ShotRow>> = {}): {
  onChange: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  render(
    <ShotRow
      shot={shot}
      index={0}
      isFirst={true}
      isLast={false}
      speakers={[]}
      library={library}
      vocabularies={vocabularies}
      canRegenerate={false}
      isBusy={false}
      onChange={onChange}
      onMove={vi.fn()}
      onRemove={vi.fn()}
      onRegenerate={vi.fn()}
      {...over}
    />
  )
  return { onChange }
}

describe("ShotRow", () => {
  it("shows the shot's number, length and action", () => {
    renderRow()

    expect(screen.getByText("Shot 1")).toBeInTheDocument()
    expect(screen.getByLabelText("Seconds")).toHaveValue(4.5)
    expect(screen.getByLabelText("What happens")).toHaveValue("climbs the last steps")
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

  it("reports what happens once the field is left", () => {
    const { onChange } = renderRow()

    const action = screen.getByLabelText("What happens")
    fireEvent.change(action, { target: { value: "reaches for the lamp" } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.blur(action)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reaches for the lamp" })
    )
  })

  it("offers no transition on the first shot", () => {
    renderRow()

    expect(screen.queryByLabelText("Cut into it with")).not.toBeInTheDocument()
  })

  it("offers a transition on a later shot", () => {
    renderRow({ index: 1, isFirst: false })

    expect(screen.getByLabelText("Cut into it with")).toBeInTheDocument()
  })

  it("adds a library thing to what the shot shows", () => {
    const { onChange } = renderRow()

    fireEvent.click(screen.getByRole("button", { name: "Keeper" }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ things: [5] }))
  })

  it("takes a library thing away again", () => {
    const { onChange } = renderRow({
      shot: { ...shot, things: [{ id: 5, kind: "person", name: "Keeper", description: "x" }] },
    })

    fireEvent.click(screen.getByRole("button", { name: "Keeper" }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ things: [] }))
  })

  it("cannot move the first shot earlier", () => {
    renderRow()

    expect(screen.getByRole("button", { name: "Move shot 1 earlier" })).toBeDisabled()
  })

  it("cannot rewrite one shot until the clip has been written once", () => {
    renderRow()

    expect(screen.getByRole("button", { name: "Write shot 1 again" })).toBeDisabled()
  })

  it("asks for dialogue only once the clip has a speaker", () => {
    renderRow()

    expect(
      screen.getByText("Add a speaker to the clip before writing dialogue.")
    ).toBeInTheDocument()
  })
})
