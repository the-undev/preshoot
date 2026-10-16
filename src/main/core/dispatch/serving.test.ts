import { describe, expect, it } from "vitest"
import { byteRange, outputMediaType } from "./serving"

describe("outputMediaType", () => {
  it("serves pictures, video and sound as what they are, whatever the case", () => {
    expect(outputMediaType("outputs/run-1/frame.PNG")).toBe("image/png")
    expect(outputMediaType("outputs/run-1/clip.mp4")).toBe("video/mp4")
    expect(outputMediaType("outputs/run-1/clip.webm")).toBe("video/webm")
    expect(outputMediaType("outputs/run-1/voice.wav")).toBe("audio/wav")
    expect(outputMediaType("outputs/run-1/voice.mp3")).toBe("audio/mpeg")
  })

  it("serves anything else as plain bytes", () => {
    expect(outputMediaType("outputs/run-1/latent.safetensors")).toBe("application/octet-stream")
    expect(outputMediaType("outputs/run-1/noextension")).toBe("application/octet-stream")
  })
})

describe("byteRange", () => {
  it("gives the whole file when nothing is asked for or the header cannot be read", () => {
    expect(byteRange(null, 100)).toEqual({ kind: "whole" })
    expect(byteRange("bytes=-", 100)).toEqual({ kind: "whole" })
    expect(byteRange("items=0-10", 100)).toEqual({ kind: "whole" })
    expect(byteRange("bytes=0-10,20-30", 100)).toEqual({ kind: "whole" })
    expect(byteRange("bytes=20-10", 100)).toEqual({ kind: "whole" })
  })

  it("gives a range with both ends", () => {
    expect(byteRange("bytes=10-19", 100)).toEqual({ kind: "part", start: 10, end: 19 })
  })

  it("runs an open range to the end of the file", () => {
    expect(byteRange("bytes=0-", 100)).toEqual({ kind: "part", start: 0, end: 99 })
    expect(byteRange("bytes=90-", 100)).toEqual({ kind: "part", start: 90, end: 99 })
  })

  it("stops a range that runs past the end at the end", () => {
    expect(byteRange("bytes=50-500", 100)).toEqual({ kind: "part", start: 50, end: 99 })
  })

  it("gives the last bytes for a suffix, or the whole file when it is shorter", () => {
    expect(byteRange("bytes=-10", 100)).toEqual({ kind: "part", start: 90, end: 99 })
    expect(byteRange("bytes=-500", 100)).toEqual({ kind: "part", start: 0, end: 99 })
  })

  it("refuses a range that starts past the end or asks for nothing", () => {
    expect(byteRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" })
    expect(byteRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" })
    expect(byteRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" })
  })
})
