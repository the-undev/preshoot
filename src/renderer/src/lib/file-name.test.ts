import { describe, expect, it } from "vitest"
import { fileName } from "./file-name"

describe("fileName", () => {
  it("gives the last part of a path, whichever separator it uses", () => {
    expect(fileName("outputs/run-4/clip.mp4")).toBe("clip.mp4")
    expect(fileName("C:\\Users\\anna\\anna.png")).toBe("anna.png")
    expect(fileName("anna.png")).toBe("anna.png")
  })
})
