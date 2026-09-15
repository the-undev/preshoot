import { describe, expect, it } from "vitest"
import type { ClipComposition, ShotComposition } from "./clip"
import { buildRequest } from "./request"

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
    beats: [{ subjectName: null, text: "something happens" }],
    dialogue: [],
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
  speakers: [],
  shots: [shot(11, 5000), shot(12, 3500)],
}

const picture = {
  imageId: 3,
  fileName: "3-aaa.png",
  mediaType: "image/png",
  assetName: "Keeper",
}

describe("buildRequest", () => {
  it("names the task the way the model does", () => {
    expect(buildRequest(composition, "a prompt").task).toBe("t2va")
    expect(buildRequest({ ...composition, form: "i2v" }, "a prompt").task).toBe("i2va")
    expect(buildRequest({ ...composition, form: "fl2v" }, "a prompt").task).toBe("fl2va")
    expect(buildRequest({ ...composition, form: "l2v" }, "a prompt").task).toBe("l2va")
  })

  it("adds the shots up into seconds", () => {
    expect(buildRequest(composition, "a prompt").durationSeconds).toBe(8.5)
  })

  it("carries the shape and the short edge the clip was given", () => {
    const request = buildRequest({ ...composition, shortEdge: 1080 }, "a prompt")

    expect(request.shortEdge).toBe(1080)
    expect(request.aspectRatio).toBe("16:9")
    expect(request.aspectRatioName).toBe("Widescreen")
  })

  it("works the pixel size out from the short edge and the shape", () => {
    const wide = buildRequest({ ...composition, shortEdge: 1080 }, "a prompt")
    const tall = buildRequest({ ...composition, shortEdge: 1080, aspectRatio: "9:16" }, "a prompt")
    const square = buildRequest({ ...composition, shortEdge: 1080, aspectRatio: "1:1" }, "a prompt")

    expect([wide.width, wide.height]).toEqual([1920, 1080])
    expect([tall.width, tall.height]).toEqual([1080, 1920])
    expect([square.width, square.height]).toEqual([1080, 1080])
  })

  it("hands over nothing when the clip is written from text", () => {
    expect(buildRequest(composition, "a prompt").conditions).toEqual([])
  })

  it("says which end of the clip each picture anchors", () => {
    const request = buildRequest(
      {
        ...composition,
        form: "fl2v",
        frames: [
          { ...picture, role: "first" },
          { ...picture, role: "last", imageId: 4, fileName: "4-bbb.png" },
        ],
      },
      "a prompt"
    )

    expect(request.conditions).toEqual([
      {
        type: "image",
        role: "keyframe",
        at: "first frame",
        fileName: "3-aaa.png",
        fromAsset: "Keeper",
      },
      {
        type: "image",
        role: "keyframe",
        at: "last frame",
        fileName: "4-bbb.png",
        fromAsset: "Keeper",
      },
    ])
  })

  it("keeps the prompt it was given as one field of the request", () => {
    expect(buildRequest(composition, "integrated_multimodal_description: ...").prompt).toBe(
      "integrated_multimodal_description: ..."
    )
  })
})
