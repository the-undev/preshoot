import { describe, expect, it } from "vitest"
import type { ClipComposition, LineComposition, ShotComposition } from "@renderer/lib/trpc"

import { clipReadiness } from "./readiness"

/** One thing that happens, as the store hands it over. */
function line(id: number, text: string, subjectIds: number[] = []): LineComposition {
  return {
    id,
    kind: "action",
    subjectIds,
    text,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

function shot(id: number, text: string): ShotComposition {
  return {
    id,
    durationMs: 4000,
    cameraMotion: null,
    amplitude: null,
    speed: null,
    transition: null,
    lighting: null,
    things: [],
    lines: [line(id, text)],
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
  note: "",
  musicNote: "",
  language: "English",
  cast: [],
  shots: [shot(11, "climbs the stairs")],
}

describe("clipReadiness", () => {
  it("says nothing about a clip that is ready", () => {
    expect(clipReadiness(composition)).toEqual([])
  })

  it("asks for a shot", () => {
    expect(clipReadiness({ ...composition, shots: [] })).toEqual(["This clip has no shots."])
  })

  it("names the one shot with nothing happening in it", () => {
    expect(clipReadiness({ ...composition, shots: [shot(11, "  ")] })).toEqual([
      "Shot 1 has nothing happening in it.",
    ])
  })

  it("names several empty shots together", () => {
    expect(
      clipReadiness({ ...composition, shots: [shot(11, ""), shot(12, "a"), shot(13, "")] })
    ).toEqual(["Shots 1, 3 have nothing happening in them."])
  })

  it("asks for the pictures the form anchors to", () => {
    expect(clipReadiness({ ...composition, form: "fl2v" })).toEqual([
      "Choose the picture this clip opens on.",
      "Choose the picture this clip ends on.",
    ])
  })

  it("asks only for the picture that is missing", () => {
    const withFirst: ClipComposition = {
      ...composition,
      form: "fl2v",
      frames: [
        {
          role: "first",
          imageId: 3,
          fileName: "3-a.png",
          mediaType: "image/png",
          assetName: "Keeper",
        },
      ],
    }

    expect(clipReadiness(withFirst)).toEqual(["Choose the picture this clip ends on."])
  })
})
