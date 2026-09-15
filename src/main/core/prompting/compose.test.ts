import { describe, expect, it } from "vitest"
import type { ClipComposition } from "../composition/clip"
import { composeClip } from "./compose"
import { minimaxH3 } from "./targets/minimax-h3"

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  form: "t2v",
  shortEdge: 768,
  aspectRatio: "16:9",
  frames: [],
  style: "Live-action, cinematic",
  note: "A keeper lights the lamp during a storm.",
  musicNote: "",
  speakers: [],
  shots: [
    {
      id: 11,
      durationMs: 4500,
      cameraMotion: "push in",
      amplitude: null,
      speed: null,
      transition: null,
      lighting: null,
      things: [],
      beats: [{ subjectName: null, text: "climbs the last steps of the tower" }],
      dialogue: [],
      soundNote: "",
    },
  ],
}

describe("composeClip", () => {
  it("writes the prompt and everything the generation needs beside it", () => {
    const composed = composeClip(composition, minimaxH3)

    expect(composed.ready).toBe(true)
    if (!composed.ready) return
    expect(composed.rendered).toContain("integrated_multimodal_description:")
    expect(composed.rendered).toContain("Climbs the last steps of the tower.")
    expect(composed.request.task).toBe("t2va")
    expect(composed.request.durationSeconds).toBe(4.5)
    expect(composed.request.aspectRatio).toBe("16:9")
  })

  it("writes the same prompt every time, since no model is involved", () => {
    const once = composeClip(composition, minimaxH3)
    const twice = composeClip(composition, minimaxH3)

    expect(once).toEqual(twice)
  })

  it("says a clip with no shots is not ready rather than failing", () => {
    const composed = composeClip({ ...composition, shots: [] }, minimaxH3)

    expect(composed).toEqual({ ready: false, reason: "This clip has no shots." })
  })

  it("says which picture a keyframe form is still waiting for", () => {
    const composed = composeClip({ ...composition, form: "i2v" }, minimaxH3)

    expect(composed).toEqual({
      ready: false,
      reason: "Choose the picture this clip opens on.",
    })
  })
})
