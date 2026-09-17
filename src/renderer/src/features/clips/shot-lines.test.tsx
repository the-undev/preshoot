import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { LineComposition, SubjectComposition } from "@renderer/lib/trpc"
import { ShotLines } from "./shot-lines"

const subjects: SubjectComposition[] = [
  { id: 5, kind: "person", name: "Keeper", description: "an elderly man", voice: null },
]

const speakers: SubjectComposition[] = [
  { id: 7, kind: "person", name: "Radio", description: "a radio", voice: "flat and clipped" },
]

const menu = {
  vocabularies: {
    cameraMotions: ["push in", "pan left"],
    amplitudes: ["with small amplitude"],
    speeds: ["at slow speed"],
    transitions: ["the camera cuts to"],
    styles: ["Live-action"],
    lightings: ["night", "candlelight"],
  },
  savedShots: [],
  savedSubjects: [],
  onAddSavedShot: vi.fn(),
  onAddSavedSubject: vi.fn(),
  onAddSubject: vi.fn(),
  onNewShot: vi.fn(),
  onSaveShot: vi.fn(),
  onSetShotField: vi.fn(),
}

function line(id: number, over: Partial<LineComposition> = {}): LineComposition {
  return {
    id,
    kind: "action",
    subjectIds: [],
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
  withSpeakers: SubjectComposition[] = speakers
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn()
  render(
    <ShotLines
      shotId={11}
      lines={lines}
      subjects={subjects}
      speakers={withSpeakers}
      startFocused={false}
      menu={menu}
      onChange={onChange}
    />
  )
  return onChange
}

describe("ShotLines", () => {
  it("shows what happens and what is said in one list, in order", () => {
    renderLines([line(1), line(2, { kind: "speech", subjectIds: [7], text: "Almost there." })])

    expect(screen.getByLabelText("Line 1 of shot 11")).toHaveValue("line 1")
    expect(screen.getByLabelText("Line 2 of shot 11")).toHaveValue("Almost there.")
    expect(screen.getByLabelText("What line 1 is")).toHaveTextContent("Action")
    expect(screen.getByLabelText("Who says line 2")).toHaveTextContent("Radio")
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
    const onChange = renderLines([line(1, { kind: "speech", subjectIds: [7], text: "Hello." })])

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "Hello." }),
      expect.objectContaining({ kind: "speech", subjectIds: [7], text: "" }),
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

  it("says what a line is in the same place whatever it is", () => {
    renderLines([
      line(1),
      line(2, { kind: "shows", subjectIds: [5] }),
      line(3, { kind: "speech", subjectIds: [7], text: "Hello." }),
    ])

    expect(screen.getByLabelText("What line 1 is")).toHaveTextContent("Action")
    expect(screen.getByLabelText("What line 2 is")).toHaveTextContent("Description")
    expect(screen.getByLabelText("What line 3 is")).toHaveTextContent("Dialogue")
  })

  it("offers to say who a line naming nobody is about", () => {
    renderLines()

    expect(screen.getByLabelText("Say who line 1 is about")).toBeInTheDocument()
    expect(screen.queryByLabelText("Who line 1 is about")).not.toBeInTheDocument()
  })

  it("offers every type by the same name it reads by", () => {
    renderLines([line(1, { subjectIds: [5] })])

    fireEvent.click(screen.getByLabelText("What line 1 is"))

    expect(screen.getByRole("button", { name: "Description" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument()
  })

  it("changes what a line is from the word in its head", () => {
    const onChange = renderLines()

    fireEvent.click(screen.getByLabelText("What line 1 is"))
    fireEvent.click(screen.getByRole("button", { name: "Description" }))

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "shows", text: "line 1" }),
    ])
  })

  it("changes who a line is about from the word in its head", () => {
    const onChange = renderLines([line(1, { subjectIds: [5] })])

    fireEvent.click(screen.getByLabelText("Who line 1 is about"))
    fireEvent.click(screen.getByRole("button", { name: "Nobody" }))

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ subjectIds: [] })])
  })

  it("names a line that was about nobody", () => {
    const onChange = renderLines()

    fireEvent.click(screen.getByLabelText("Say who line 1 is about"))
    fireEvent.click(screen.getByRole("button", { name: "Keeper" }))

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ subjectIds: [5] })])
  })

  it("will not make a line dialogue while nobody can say it", () => {
    renderLines([line(1)], [])

    fireEvent.click(screen.getByLabelText("What line 1 is"))

    expect(screen.getByRole("button", { name: "Dialogue" })).toBeDisabled()
  })

  it("says what a line shows, from the clip's own cast", () => {
    renderLines([line(1, { kind: "shows", subjectIds: [5] })])

    expect(screen.getByLabelText("What line 1 is")).toHaveTextContent("Description")
    expect(screen.getByLabelText("What line 1 shows")).toHaveTextContent("Keeper")
  })

  it("keeps a line that shows something on the same kind on enter", () => {
    const onChange = renderLines([line(1, { kind: "shows", subjectIds: [5] })])

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "shows", subjectIds: [5] }),
      expect.objectContaining({ kind: "shows", subjectIds: [], text: "" }),
    ])
  })

  it("says who speaks a line", () => {
    renderLines([line(1, { kind: "speech", subjectIds: [7], text: "Hello." })])

    expect(screen.getByLabelText("Who says line 1")).toHaveTextContent("Radio")
  })

  it("will not take a line of dialogue back to nobody, since somebody has to say it", () => {
    renderLines([line(1, { kind: "speech", subjectIds: [7], text: "Hello." })])

    fireEvent.click(screen.getByLabelText("Who says line 1"))

    expect(screen.queryByRole("button", { name: "Nobody" })).not.toBeInTheDocument()
  })

  it("calls the head by what the line is, whichever kind it is", () => {
    renderLines([
      line(1, { subjectIds: [5] }),
      line(2, { kind: "shows", subjectIds: [5] }),
      line(3, { kind: "speech", subjectIds: [7], text: "Hello." }),
    ])

    expect(screen.getByLabelText("Who line 1 is about")).toBeInTheDocument()
    expect(screen.getByLabelText("What line 2 shows")).toBeInTheDocument()
    expect(screen.getByLabelText("Who says line 3")).toBeInTheDocument()
  })

  it("removes a line", () => {
    const onChange = renderLines([line(1), line(2)])

    fireEvent.click(screen.getByRole("button", { name: "Remove line 2" }))

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ text: "line 1" })])
  })

  it("adds a line in the gap it was clicked in, not at the end", () => {
    const onChange = renderLines([line(1), line(2)])

    fireEvent.click(screen.getByRole("button", { name: "Add a line after line 1" }))

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "line 1" }),
      expect.objectContaining({ kind: "action", text: "" }),
      expect.objectContaining({ text: "line 2" }),
    ])
  })

  it("offers a way back when every line has been taken away", () => {
    const onChange = renderLines([])

    fireEvent.click(screen.getByRole("button", { name: "Add a line" }))

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ kind: "action", text: "" })])
  })

  it("offers a handle for dragging a line into another place", () => {
    renderLines()

    expect(screen.getByRole("button", { name: "Reorder line 1" })).toBeInTheDocument()
  })

  it("keeps what is true of a spoken line behind its chevron", () => {
    const onChange = renderLines([line(1, { kind: "speech", subjectIds: [7], text: "Hello." })])

    expect(screen.queryByLabelText("Off screen")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "More about line 1" }))
    fireEvent.click(screen.getByLabelText("Off screen"))

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ offScreen: true })])
  })

  it("says a line takes the clip's language unless it names one", () => {
    renderLines([line(1, { kind: "speech", subjectIds: [7], text: "Hello." })])

    fireEvent.click(screen.getByRole("button", { name: "More about line 1" }))

    expect(screen.getByLabelText("Language")).toHaveAttribute("placeholder", "As the clip")
  })

  it("opens the command menu on the line the cursor is in", () => {
    renderLines()

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: " ", ctrlKey: true })

    expect(screen.getByLabelText("What to do")).toBeInTheDocument()
  })

  it("opens the command menu from a slash on a line with nothing on it", () => {
    renderLines([line(1, { text: "" })])

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: "/" })

    expect(screen.getByLabelText("What to do")).toBeInTheDocument()
  })

  it("leaves a slash alone on a line that has something on it", () => {
    renderLines([line(1, { text: "open 24/7" })])

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: "/" })

    expect(screen.queryByLabelText("What to do")).not.toBeInTheDocument()
  })

  it("turns a line into another kind from the menu, keeping what was typed", () => {
    const onChange = renderLines([line(1, { text: "Almost there." })])

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: " ", ctrlKey: true })
    fireEvent.click(screen.getByRole("option", { name: "Make this something that is said" }))

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "speech", subjectIds: [7], text: "Almost there." }),
    ])
  })

  it("puts one of the cast on a line of its own from the menu", () => {
    const onChange = renderLines()

    fireEvent.keyDown(screen.getByLabelText("Line 1 of shot 11"), { key: " ", ctrlKey: true })
    fireEvent.click(screen.getByRole("option", { name: "Show Keeper" }))

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "line 1" }),
      expect.objectContaining({ kind: "shows", subjectIds: [5] }),
    ])
  })

  it("offers to make the word the cursor is in one of the cast", () => {
    renderLines([line(1, { text: "the radio crackles" })])

    const box = screen.getByLabelText("Line 1 of shot 11") as HTMLInputElement
    box.setSelectionRange(7, 7)
    fireEvent.keyDown(box, { key: " ", ctrlKey: true })

    expect(screen.getByRole("option", { name: "Add radio to the cast" })).toBeInTheDocument()
  })

  it("puts the cursor back in the line when the menu is closed", () => {
    renderLines()

    const box = screen.getByLabelText("Line 1 of shot 11")
    fireEvent.keyDown(box, { key: " ", ctrlKey: true })
    expect(screen.getByLabelText("What to do")).toHaveFocus()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByLabelText("What to do")).not.toBeInTheDocument()
    expect(box).toHaveFocus()
  })

  it("puts the cursor back in the line after running a command", () => {
    renderLines()

    const box = screen.getByLabelText("Line 1 of shot 11")
    fireEvent.keyDown(box, { key: " ", ctrlKey: true })
    fireEvent.click(screen.getByRole("option", { name: "Show Keeper" }))

    expect(box).toHaveFocus()
  })

  it("offers a button to add a line, not only the keys that do it", () => {
    const onChange = renderLines()

    fireEvent.click(screen.getByRole("button", { name: "Add a line at the end" }))

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "line 1" }),
      expect.objectContaining({ kind: "action", text: "" }),
    ])
  })

  it("says which keys open the menu, outside the lines themselves", () => {
    renderLines()

    expect(screen.getByText("Ctrl Space for anything else")).toBeInTheDocument()
  })
})
