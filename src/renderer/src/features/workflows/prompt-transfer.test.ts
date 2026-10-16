import { describe, expect, it } from "vitest"
import { setPromptTransfer, takePromptTransfer, type PromptTransfer } from "./prompt-transfer"

const transfer: PromptTransfer = {
  workflowId: 3,
  slotId: 1,
  text: "She turns from the window.",
  clipName: "Anna at the window",
}

describe("prompt transfer", () => {
  it("gives the prompt to the workflow it was sent to", () => {
    setPromptTransfer(transfer)

    expect(takePromptTransfer(3)).toEqual(transfer)
  })

  it("gives the prompt only once", () => {
    setPromptTransfer(transfer)
    takePromptTransfer(3)

    expect(takePromptTransfer(3)).toBeNull()
  })

  it("keeps the prompt from another workflow", () => {
    setPromptTransfer(transfer)

    expect(takePromptTransfer(4)).toBeNull()
    expect(takePromptTransfer(3)).toEqual(transfer)
  })
})
