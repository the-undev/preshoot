import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Asset, LineComposition, SpeakerComposition } from "@renderer/lib/trpc"
import { ShotLines } from "./shot-lines"

const subjects: Asset[] = [
  {
    id: 5,
    kind: "person",
    name: "Keeper",
    description: "an elderly man",
    createdAt: "2026-09-12T08:00:00.000Z",
  },
]

const speakers: SpeakerComposition[] = [
  { id: 7, label: "S1", description: "The keeper", subjectName: null },
]

function line(id: number, over: Partial<LineComposition> = {}): LineComposition {
  return {
    id,
    kind: "action",
    assetId: null,
    subjectName: null,
    speakerIds: [],
    text: `line ${id}`,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
    ...over,
  }
}

function renderLines(
  lines: LineComposition[] = [line(1)],
  withSpeakers: SpeakerComposition[] = speakers
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn()
  render(
    <ShotLines
      shotId={11}
      lines={lines}
      subjects={subjects}
      speakers={withSpeakers}
      onChange={onChange}
    />
  )
  return onChange
}

describe("ShotLines", () => {
  it("shows what happens and what is said in one list, in order", () => {
    renderLines([line(1), line(2, { kind: "speech", speakerIds: [7], text: "Almost there." })])

    expect(screen.getByLabelText("Line 1 of shot 11")).toHaveValue("line 1")
    expect(screen.getByLabelText("Line 2 of shot 11")).toHaveValue("Almost there.")
    expect(screen.getByLabelText("Who line 1 is about")).toBeInTheDocument()
    expect(screen.getByLabelText("Who says line 2")).toBeInTheDocument()
  })

  it("holds what is typed until the line is left", () => {
    const onChange = renderLines()

    const box = screen.getByLabelText("Line 1 of shot 11")
    fireEvent.change(box, { target: { value: "reaches for the lamp" } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.blur(box)
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "reaches for the lamp" }),
    ])
  })

  it("makes the next line on enter, of the same kind, rather than at the end", () => {
    const onChange = renderLines([line(1), line(2)])

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "line 1" }),
      expect.objectContaining({ kind: "action", text: "" }),
      expect.objectContaining({ text: "line 2" }),
    ])
  })

  it("makes a spoken line on enter from a spoken one", () => {
    const onChange = renderLines([line(1, { kind: "speech", speakerIds: [7], text: "Hello." })])

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "Hello." }),
      expect.objectContaining({ kind: "speech", speakerIds: [7], text: "" }),
    ])
  })

  it("takes an empty line away on backspace", () => {
    const onChange = renderLines([line(1), line(2, { text: "" })])

    fireEvent.keyDown(screen.getByLabelText("Line 2 of shot 11"), { key: "Backspace" })

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ text: "line 1" })])
  })

  it("leaves a line with something in it alone on backspace", () => {
    const onChange = renderLines([line(1), line(2)])

    fireEvent.keyDown(screen.getByLabelText("Line 2 of shot 11"), { key: "Backspace" })

    expect(onChange).not.toHaveBeenCalled()
  })

  it("says who a line is about, and says the scene when it is about nobody", () => {
    renderLines([line(1), line(2, { assetId: 5, subjectName: "Keeper" })])

    expect(screen.getByLabelText("Who line 1 is about")).toHaveTextContent("The scene")
    expect(screen.getByLabelText("Who line 2 is about")).toHaveTextContent("Keeper")
  })

  it("says who speaks a line", () => {
    renderLines([line(1, { kind: "speech", speakerIds: [7], text: "Hello." })])

    expect(screen.getByLabelText("Who says line 1")).toHaveTextContent("S1 The keeper")
  })

  it("removes a line", () => {
    const onChange = renderLines([line(1), line(2)])

    fireEvent.click(screen.getByRole("button", { name: "Remove line 2" }))

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ text: "line 1" })])
  })

  it("adds a line after the one the plus belongs to, not at the end", () => {
    const onChange = renderLines([line(1), line(2)])

    fireEvent.click(screen.getByRole("button", { name: "Add something that happens after line 1" }))

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "line 1" }),
      expect.objectContaining({ text: "" }),
      expect.objectContaining({ text: "line 2" }),
    ])
  })

  it("offers a handle for dragging a line into another place", () => {
    renderLines()

    expect(screen.getByRole("button", { name: "Reorder line 1" })).toBeInTheDocument()
  })

  it("offers dialogue only once the clip has a speaker", () => {
    renderLines([line(1)], [])

    expect(screen.getByRole("button", { name: "Add a line of dialogue" })).toBeDisabled()
  })

  it("keeps what is true of a spoken line behind its chevron", () => {
    const onChange = renderLines([line(1, { kind: "speech", speakerIds: [7], text: "Hello." })])

    expect(screen.queryByLabelText("Off screen")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "More about line 1" }))
    fireEvent.click(screen.getByLabelText("Off screen"))

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ offScreen: true })])
  })

  it("says a line takes the clip's language unless it names one", () => {
    renderLines([line(1, { kind: "speech", speakerIds: [7], text: "Hello." })])

    fireEvent.click(screen.getByRole("button", { name: "More about line 1" }))

    expect(screen.getByLabelText("Language")).toHaveAttribute("placeholder", "As the clip")
  })
})
