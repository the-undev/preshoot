import { describe, expect, it } from "vitest"
import { joinPath } from "./join-path"

describe("joinPath", () => {
  it("appends a segment", () => {
    expect(joinPath("/home/x/films", "My film")).toBe("/home/x/films/My film")
  })

  it("does not double the separator", () => {
    expect(joinPath("/home/x/films/", "My film")).toBe("/home/x/films/My film")
  })

  it("keeps the separator the directory already uses", () => {
    expect(joinPath("C:\\films", "My film")).toBe("C:\\films\\My film")
  })

  it("appends to the root", () => {
    expect(joinPath("/", "My film")).toBe("/My film")
  })
})
