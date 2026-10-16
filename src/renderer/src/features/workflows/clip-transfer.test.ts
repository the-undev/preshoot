import { describe, expect, it } from "vitest"
import { setClipTransfer, takeClipTransfer, type ClipTransfer } from "./clip-transfer"

const transfer: ClipTransfer = {
  workflowId: 3,
  clipName: "Anna at the window",
  values: [
    { slotId: 1, value: { type: "text", text: "She turns from the window." } },
    { slotId: 2, value: { type: "number", value: 4.5 } },
    { slotId: 5, value: { type: "file", path: "/film/assets/images/3-aaa.png" } },
  ],
}

describe("clip transfer", () => {
  it("gives every value to the workflow they were sent to", () => {
    setClipTransfer(transfer)

    expect(takeClipTransfer(3)).toEqual(transfer)
  })

  it("gives the values only once", () => {
    setClipTransfer(transfer)
    takeClipTransfer(3)

    expect(takeClipTransfer(3)).toBeNull()
  })

  it("keeps the values from another workflow", () => {
    setClipTransfer(transfer)

    expect(takeClipTransfer(4)).toBeNull()
    expect(takeClipTransfer(3)).toEqual(transfer)
  })
})
