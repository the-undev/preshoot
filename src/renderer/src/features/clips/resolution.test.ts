import { describe, expect, it } from "vitest"
import type { AspectRatio } from "@renderer/lib/trpc"
import { orientationOf, pixelSize, shapesFacing, turned } from "./resolution"

const shapes: AspectRatio[] = [
  { value: "16:9", name: "Widescreen", width: 16, height: 9 },
  { value: "4:3", name: "Classic", width: 4, height: 3 },
  { value: "1:1", name: "Square", width: 1, height: 1 },
  { value: "3:4", name: "Classic", width: 3, height: 4 },
  { value: "9:16", name: "Widescreen", width: 9, height: 16 },
]

function shape(value: string): AspectRatio {
  const found = shapes.find((entry) => entry.value === value)
  if (!found) throw new Error(`No shape ${value}`)
  return found
}

describe("orientationOf", () => {
  it("reads a shape wider than it is tall as landscape", () => {
    expect(orientationOf(shape("16:9"))).toBe("landscape")
  })

  it("reads a shape taller than it is wide as portrait", () => {
    expect(orientationOf(shape("9:16"))).toBe("portrait")
  })

  it("puts a square with the landscape shapes, so the toggle always has an answer", () => {
    expect(orientationOf(shape("1:1"))).toBe("landscape")
  })
})

describe("shapesFacing", () => {
  it("offers the shapes of one orientation, with the square in both", () => {
    expect(shapesFacing(shapes, "landscape").map((entry) => entry.value)).toEqual([
      "16:9",
      "4:3",
      "1:1",
    ])
    expect(shapesFacing(shapes, "portrait").map((entry) => entry.value)).toEqual([
      "1:1",
      "3:4",
      "9:16",
    ])
  })
})

describe("turned", () => {
  it("finds the same ratio the other way round", () => {
    expect(turned(shapes, shape("16:9")).value).toBe("9:16")
    expect(turned(shapes, shape("3:4")).value).toBe("4:3")
  })

  it("leaves a square where it is", () => {
    expect(turned(shapes, shape("1:1")).value).toBe("1:1")
  })
})

describe("pixelSize", () => {
  it("puts the short edge on the shorter side", () => {
    expect(pixelSize(1080, shape("16:9"))).toEqual({ width: 1920, height: 1080 })
    expect(pixelSize(1080, shape("9:16"))).toEqual({ width: 1080, height: 1920 })
    expect(pixelSize(1080, shape("1:1"))).toEqual({ width: 1080, height: 1080 })
  })

  it("rounds the long edge to a whole pixel", () => {
    expect(pixelSize(500, shape("16:9"))).toEqual({ width: 889, height: 500 })
  })
})
