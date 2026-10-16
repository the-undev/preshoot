import { describe, expect, it } from "vitest"
import { freeName } from "./free-name"

/** A claim that takes any name not in `taken`, and keeps it taken. */
function claimFrom(taken: Set<string>): (candidate: string) => boolean {
  return (candidate) => {
    if (taken.has(candidate)) return false
    taken.add(candidate)
    return true
  }
}

describe("freeName", () => {
  it("keeps a name nothing holds", () => {
    expect(freeName("clip.mp4", claimFrom(new Set()))).toBe("clip.mp4")
  })

  it("numbers a taken name before its extension, from 2", () => {
    const taken = new Set(["clip.mp4", "clip-2.mp4"])

    expect(freeName("clip.mp4", claimFrom(taken))).toBe("clip-3.mp4")
    expect(freeName("archive.tar.gz", claimFrom(new Set(["archive.tar.gz"])))).toBe(
      "archive.tar-2.gz"
    )
    expect(freeName("notes", claimFrom(new Set(["notes"])))).toBe("notes-2")
  })

  it("reads a name whose only dot leads it as having no extension", () => {
    expect(freeName(".env", claimFrom(new Set([".env"])))).toBe(".env-2")
    expect(freeName(".env.local", claimFrom(new Set([".env.local"])))).toBe(".env-2.local")
  })
})
