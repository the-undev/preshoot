import { describe, expect, it } from "vitest"
import type { LineComposition, ShotComposition } from "@renderer/lib/trpc"
import { landingOf, lineAt, lineId, linesOfShotId, shotId, shotOf } from "./line-drag"

function line(id: number): LineComposition {
  return {
    id,
    kind: "action",
    subjectIds: [],
    text: `line ${id}`,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

function shot(id: number, howMany: number): ShotComposition {
  return {
    id,
    durationMs: 4000,
    cameraMotion: null,
    amplitude: null,
    speed: null,
    transition: null,
    lighting: null,
    lines: Array.from({ length: howMany }, (_, at) => line(at + 1)),
  }
}

const shots = [shot(11, 3), shot(12, 2), shot(13, 0)]

describe("what a drag is called", () => {
  it("says which shot a line belongs to and where it is in it", () => {
    expect(lineAt(lineId(11, 2))).toEqual({ shotId: 11, at: 2 })
  })

  it("says nothing about a shot or an empty shot's room, which are not lines", () => {
    expect(lineAt(shotId(11))).toBeNull()
    expect(lineAt(linesOfShotId(11))).toBeNull()
  })

  it("says which shot anything belongs to", () => {
    expect(shotOf(lineId(11, 2))).toBe(11)
    expect(shotOf(shotId(12))).toBe(12)
    expect(shotOf(linesOfShotId(13))).toBe(13)
  })
})

describe("where a dragged line lands", () => {
  it("lands where the line it was dropped on is, in another shot", () => {
    expect(landingOf(lineId(12, 1), { shotId: 11, at: 0 }, shots)).toEqual({
      toShotId: 12,
      toPosition: 1,
    })
  })

  it("closes the gap it left when it moves down its own shot", () => {
    expect(landingOf(lineId(11, 2), { shotId: 11, at: 0 }, shots)).toEqual({
      toShotId: 11,
      toPosition: 1,
    })
  })

  it("lands where it was dropped when it moves up its own shot", () => {
    expect(landingOf(lineId(11, 0), { shotId: 11, at: 2 }, shots)).toEqual({
      toShotId: 11,
      toPosition: 0,
    })
  })

  it("goes on the end of a shot it was dropped on rather than on one of its lines", () => {
    expect(landingOf(linesOfShotId(12), { shotId: 11, at: 0 }, shots)).toEqual({
      toShotId: 12,
      toPosition: 2,
    })
  })

  it("lands in a shot with nothing in it", () => {
    expect(landingOf(linesOfShotId(13), { shotId: 11, at: 1 }, shots)).toEqual({
      toShotId: 13,
      toPosition: 0,
    })
  })

  it("goes nowhere when it was dropped on something that is not part of the clip", () => {
    expect(landingOf("something-else", { shotId: 11, at: 0 }, shots)).toBeNull()
  })
})
