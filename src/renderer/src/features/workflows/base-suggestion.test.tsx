import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StubTrpcProvider, type StubAnswers } from "@renderer/lib/stub-trpc"
import { BaseSuggestionLine } from "./base-suggestion"

const suggestion = { workflowId: 2, name: "h3-r2v-base", matchingSlots: 7 }

const line = "h3-r2v-base maps 7 of the same slots. Copy its tiers and notes?"

function renderLine(answers: StubAnswers): void {
  render(
    <StubTrpcProvider answers={answers}>
      <BaseSuggestionLine workflowId={5} suggestion={suggestion} />
    </StubTrpcProvider>
  )
}

describe("BaseSuggestionLine", () => {
  it("says which workflow shares how many slots", () => {
    renderLine({})

    expect(screen.getByText(line)).toBeInTheDocument()
  })

  it("copies from the suggested workflow onto the imported one, then goes", async () => {
    const copies: unknown[] = []
    renderLine({
      "workflows.copyMapping": (input: unknown) => {
        copies.push(input)
        return null
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Copy" }))

    await waitFor(() => expect(screen.queryByText(line)).not.toBeInTheDocument())
    expect(copies).toEqual([{ workflowId: 5, fromWorkflowId: 2 }])
  })

  it("stays with the reason when the copy fails", async () => {
    renderLine({})

    fireEvent.click(screen.getByRole("button", { name: "Copy" }))

    expect(await screen.findByText("Nothing answers workflows.copyMapping.")).toBeInTheDocument()
    expect(screen.getByText(line)).toBeInTheDocument()
  })

  it("goes without copying anything when dismissed", () => {
    const copies: unknown[] = []
    renderLine({
      "workflows.copyMapping": (input: unknown) => {
        copies.push(input)
        return null
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(screen.queryByText(line)).not.toBeInTheDocument()
    expect(copies).toEqual([])
  })
})
