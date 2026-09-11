import { describe, expect, it } from "vitest"
import { folderName } from "./folder-name"

describe("folderName", () => {
  it("takes the last segment", () => {
    expect(folderName("/home/x/films/my-film")).toBe("my-film")
  })

  it("ignores a trailing separator", () => {
    expect(folderName("/home/x/films/my-film/")).toBe("my-film")
  })

  it("handles a Windows path", () => {
    expect(folderName("C:\\films\\my-film")).toBe("my-film")
  })

  it("falls back to the path itself when there are no segments", () => {
    expect(folderName("/")).toBe("/")
  })
})
