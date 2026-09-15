import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ClipComposition, Vocabularies } from "@renderer/lib/trpc"
import { ClipSettingsDialog } from "./clip-settings-dialog"

const vocabularies: Vocabularies = {
  cameraMotions: ["push in"],
  amplitudes: ["with small amplitude"],
  speeds: ["at slow speed"],
  transitions: ["the camera cuts to"],
  styles: ["Live-action, cinematic"],
  lightings: ["night"],
}

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  form: "t2v",
  shortEdge: 1080,
  aspectRatio: "16:9",
  frames: [],
  style: "Live-action, cinematic",
  note: "A keeper lights the lamp.",
  musicNote: "",
  language: "English",
  cast: [],
  shots: [],
}

function renderSettings(over: Partial<ClipComposition> = {}): {
  onChange: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(
    <ClipSettingsDialog
      composition={{ ...composition, ...over }}
      vocabularies={vocabularies}
      libraryImages={[]}
      aspectRatios={[
        { value: "16:9", name: "Widescreen", width: 16, height: 9 },
        { value: "1:1", name: "Square", width: 1, height: 1 },
        { value: "9:16", name: "Widescreen", width: 9, height: 16 },
      ]}
      onChange={onChange}
      onSetFrame={vi.fn()}
      onClose={onClose}
    />
  )
  return { onChange, onClose }
}

describe("ClipSettingsDialog", () => {
  it("shows the clip's own fields", () => {
    renderSettings()

    expect(screen.getByLabelText("Style")).toHaveValue("Live-action, cinematic")
    expect(screen.getByLabelText("Language")).toHaveValue("English")
    expect(screen.getByLabelText("Note")).toHaveValue("A keeper lights the lamp.")
  })

  it("says what kind of generation the clip is for", () => {
    renderSettings()

    expect(screen.getByLabelText("Generation type")).toHaveTextContent("Text to video (t2va)")
  })

  it("shows the resolution it is generated at", () => {
    renderSettings()

    expect(screen.getByRole("radio", { name: "16:9 Widescreen" })).toBeChecked()
    expect(screen.getByText("1920 × 1080")).toBeInTheDocument()
  })

  it("reports the style once the field is left", () => {
    const { onChange } = renderSettings()

    const style = screen.getByLabelText("Style")
    fireEvent.change(style, { target: { value: "vintage film" } })
    fireEvent.blur(style)

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ style: "vintage film" }))
  })

  it("keeps the language it had when the box is emptied", () => {
    const { onChange } = renderSettings()

    const language = screen.getByLabelText("Language")
    fireEvent.change(language, { target: { value: "  " } })
    fireEvent.blur(language)

    expect(onChange).not.toHaveBeenCalled()
    expect(language).toHaveValue("English")
  })

  it("asks for a picture when the form needs one", () => {
    renderSettings({ form: "i2v" })

    expect(screen.getByLabelText("Opens on")).toBeInTheDocument()
  })

  it("asks for nothing extra when the clip is written from text", () => {
    renderSettings()

    expect(screen.queryByLabelText("Opens on")).not.toBeInTheDocument()
  })

  it("explains a field rather than showing an example inside it", () => {
    renderSettings()

    expect(screen.getByLabelText("Note")).not.toHaveAttribute("placeholder")
    expect(screen.getByRole("button", { name: "What the note is for" })).toBeInTheDocument()
  })
})
