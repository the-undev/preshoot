import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "./index"

describe("design system", () => {
  it("exports a Button that renders its label", () => {
    render(<Button>Open project</Button>)
    expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument()
  })
})
