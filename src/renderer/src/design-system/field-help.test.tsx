import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FieldHelp } from "./field-help"

describe("FieldHelp", () => {
  it("names the field it explains, so a page of them can be told apart", () => {
    render(<FieldHelp label="the note">For you, not for the model.</FieldHelp>)

    expect(screen.getByRole("button", { name: "What the note is for" })).toBeInTheDocument()
  })

  it("carries its own tooltip provider, so it works wherever it is put", () => {
    expect(() =>
      render(<FieldHelp label="sound">What is heard that nobody says.</FieldHelp>)
    ).not.toThrow()
  })
})
