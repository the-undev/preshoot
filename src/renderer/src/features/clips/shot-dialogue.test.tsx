import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { DialogueLine, SpeakerComposition } from "@renderer/lib/trpc"
import { ShotDialogue } from "./shot-dialogue"

const speakers: SpeakerComposition[] = [
  { id: 7, label: "S1", description: "The keeper" },
  { id: 8, label: "S2", description: "The operator" },
]

const lines: DialogueLine[] = [{ speakerId: 7, language: "English", text: "Almost" }]

describe("ShotDialogue", () => {
  it("asks for a speaker before a line can be written", () => {
    render(<ShotDialogue shotId={11} lines={[]} speakers={[]} onChange={vi.fn()} />)

    expect(
      screen.getByText("Add a speaker to the clip before writing dialogue.")
    ).toBeInTheDocument()
  })

  it("keeps a space typed at the end of a word", () => {
    const onChange = vi.fn()
    render(<ShotDialogue shotId={11} lines={lines} speakers={speakers} onChange={onChange} />)

    const text = screen.getByLabelText("Line 1 of shot 11")
    fireEvent.change(text, { target: { value: "Almost " } })

    expect(text).toHaveValue("Almost ")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("writes the line once it is left", () => {
    const onChange = vi.fn()
    render(<ShotDialogue shotId={11} lines={lines} speakers={speakers} onChange={onChange} />)

    const text = screen.getByLabelText("Line 1 of shot 11")
    fireEvent.change(text, { target: { value: "Almost there." } })
    fireEvent.blur(text)

    expect(onChange).toHaveBeenCalledWith([
      { speakerId: 7, language: "English", text: "Almost there." },
    ])
  })

  it("adds a line at once, so it has somewhere to be typed", () => {
    const onChange = vi.fn()
    render(<ShotDialogue shotId={11} lines={[]} speakers={speakers} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Add line" }))

    expect(onChange).toHaveBeenCalledWith([{ speakerId: 7, language: "English", text: "" }])
  })

  it("removes a line at once", () => {
    const onChange = vi.fn()
    render(<ShotDialogue shotId={11} lines={lines} speakers={speakers} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    expect(onChange).toHaveBeenCalledWith([])
  })
})
