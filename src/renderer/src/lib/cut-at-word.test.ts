import { describe, expect, it } from "vitest"
import { cutAtWord } from "./cut-at-word"

describe("cutAtWord", () => {
  it("gives a text that fits back whole", () => {
    expect(cutAtWord("A man at a window.", 18)).toBe("A man at a window.")
  })

  it("cuts a longer text at the last word that fits", () => {
    expect(cutAtWord("A man at a window.", 12)).toBe("A man at a…")
  })

  it("keeps the last word when the cut lands just after it", () => {
    expect(cutAtWord("A man at a window.", 10)).toBe("A man at a…")
  })

  it("cuts a single long word where the length ends", () => {
    expect(cutAtWord("Supercalifragilistic", 5)).toBe("Super…")
  })
})
