import { describe, expect, it } from "vitest"
import {
  clipDurationMs,
  shotStartMs,
  speakerOf,
  type ClipComposition,
  type LineComposition,
  type ShotComposition,
} from "./clip"

/** One thing that happens, as the store hands it over. */
function action(id: number, text: string): LineComposition {
  return {
    id,
    kind: "action",
    assetId: null,
    subjectName: null,
    speakerIds: [],
    text,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

function shot(id: number, durationMs: number): ShotComposition {
  return {
    id,
    durationMs,
    cameraMotion: null,
    amplitude: null,
    speed: null,
    transition: null,
    lighting: null,
    things: [],
    lines: [action(id, `Shot ${id} happens.`)],
    soundNote: "",
  }
}

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  form: "t2v",
  shortEdge: 768,
  aspectRatio: "16:9",
  frames: [],
  style: "Live-action, cinematic",
  note: "A keeper lights the lamp.",
  musicNote: "",
  language: "English",
  speakers: [
    { id: 7, label: "S1", description: "The keeper, weathered and low.", subjectName: null },
  ],
  shots: [shot(1, 4500), shot(2, 3000), shot(3, 2500)],
}

describe("clipDurationMs", () => {
  it("adds up the shots", () => {
    expect(clipDurationMs(composition)).toBe(10000)
  })

  it("is zero for a clip with no shots", () => {
    expect(clipDurationMs({ ...composition, shots: [] })).toBe(0)
  })
})

describe("shotStartMs", () => {
  it("starts the first shot at zero", () => {
    expect(shotStartMs(composition, 1)).toBe(0)
  })

  it("starts a later shot after everything before it", () => {
    expect(shotStartMs(composition, 2)).toBe(4500)
    expect(shotStartMs(composition, 3)).toBe(7500)
  })

  it("refuses a shot that is not in the clip", () => {
    expect(() => shotStartMs(composition, 99)).toThrow(/99/)
  })
})

describe("speakerOf", () => {
  it("finds the speaker of a line", () => {
    expect(speakerOf(composition, 7)?.label).toBe("S1")
  })

  it("returns nothing for a speaker the clip does not have", () => {
    expect(speakerOf(composition, 8)).toBeNull()
  })
})
