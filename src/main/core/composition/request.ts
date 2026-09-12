import { ASPECT_RATIOS } from "./aspect"
import { clipDurationMs, type ClipComposition, type ClipForm } from "./clip"

/** What the model calls each form in the `task` field of a request. */
const TASKS: Record<ClipForm, string> = {
  t2v: "t2va",
  i2v: "i2va",
  fl2v: "fl2va",
  l2v: "l2va",
}

/**
 * One file handed to the generation. The model takes a frame index for a keyframe; nothing here
 * holds a frame rate, so this says which end of the clip it anchors and leaves the index to
 * whoever has one.
 */
export interface GenerationCondition {
  type: "image"
  role: "keyframe"
  at: "first frame" | "last frame"
  fileName: string
  fromAsset: string
}

/** Everything a generation of this clip needs, the prompt being one field of it. */
export interface GenerationRequest {
  task: string
  prompt: string
  durationSeconds: number
  shortEdge: number
  aspectRatio: string
  aspectRatioName: string
  seed: number
  conditions: GenerationCondition[]
}

/** Gathers what a generation needs from the clip it was written for and the prompt it produced. */
export function buildRequest(composition: ClipComposition, rendered: string): GenerationRequest {
  const shape = ASPECT_RATIOS.find((entry) => entry.value === composition.aspectRatio)
  return {
    task: TASKS[composition.form],
    prompt: rendered,
    durationSeconds: Number((clipDurationMs(composition) / 1000).toFixed(2)),
    shortEdge: composition.shortEdge,
    aspectRatio: composition.aspectRatio,
    aspectRatioName: shape?.name ?? composition.aspectRatio,
    seed: composition.seed,
    conditions: composition.frames.map((frame) => ({
      type: "image",
      role: "keyframe",
      at: frame.role === "first" ? "first frame" : "last frame",
      fileName: frame.fileName,
      fromAsset: frame.assetName,
    })),
  }
}
