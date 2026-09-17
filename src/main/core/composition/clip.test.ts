import { describe, expect, it } from "vitest"
import {
  clipDurationMs,
  shotStartMs,
  speakerLabelOf,
  speakingOrder,
  subjectIdsOf,
  subjectOf,
  type ClipComposition,
  type LineComposition,
  type ShotComposition,
} from "./clip"

/** One thing that happens, as the store hands it over. */
function action(id: number, text: string): LineComposition {
  return {
    id,
    kind: "action",
    subjectIds: [],
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
    lines: [action(id, `Shot ${id} happens.`)],
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
  soundscape: "",
  language: "English",
  cast: [
    { id: 7, kind: "person", name: "Keeper", description: "an elderly man", voice: "weathered" },
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

describe("subjectOf", () => {
  it("finds one of the clip's subjects by id", () => {
    expect(subjectOf(composition, 7)?.name).toBe("Keeper")
  })

  it("returns nothing for a subject the clip does not have", () => {
    expect(subjectOf(composition, 8)).toBeNull()
  })
})

describe("speakingOrder", () => {
  it("numbers the subjects by when they first speak, not by when they were added", () => {
    const speaking: ClipComposition = {
      ...composition,
      cast: [
        { id: 7, kind: "person", name: "Keeper", description: "a", voice: null },
        { id: 8, kind: "person", name: "Operator", description: "b", voice: null },
      ],
      shots: [
        {
          ...shot(1, 4000),
          lines: [
            { ...action(1, "x"), kind: "speech", subjectIds: [8], text: "Say again." },
            { ...action(2, "y"), kind: "speech", subjectIds: [7], text: "Almost there." },
          ],
        },
      ],
    }

    expect(speakingOrder(speaking)).toEqual([8, 7])
    expect(speakerLabelOf(speaking, 8)).toBe("S1")
    expect(speakerLabelOf(speaking, 7)).toBe("S2")
  })

  it("leaves out a subject that never says anything", () => {
    expect(speakingOrder(composition)).toEqual([])
    expect(speakerLabelOf(composition, 7)).toBeNull()
  })
})

describe("subjectIdsOf", () => {
  it("names each subject once, in the order the lines first name it", () => {
    const shown = {
      ...shot(1, 4000),
      lines: [
        { ...action(1, ""), kind: "shows" as const, subjectIds: [9] },
        { ...action(2, "climbs the steps"), subjectIds: [7] },
        { ...action(3, "reaches for the lamp"), subjectIds: [7] },
        action(4, "rain runs down the glass"),
      ],
    }

    expect(subjectIdsOf(shown)).toEqual([9, 7])
  })

  it("names nobody for a shot whose lines are all about the scene", () => {
    expect(subjectIdsOf(shot(1, 4000))).toEqual([])
  })
})
