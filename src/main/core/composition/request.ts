import { ASPECT_RATIOS, type AspectRatio } from "./aspect"
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
  width: number
  height: number
  conditions: GenerationCondition[]
}

/**
 * The size in pixels a clip generates at. The short edge is the smaller of the two sides, so the
 * other one follows from the shape, rounded to a whole pixel.
 */
export function pixelSize(
  shortEdge: number,
  shape: AspectRatio | undefined
): { width: number; height: number } {
  if (!shape) {
    return { width: shortEdge, height: shortEdge }
  }
  const longEdge = Math.round(
    (shortEdge * Math.max(shape.width, shape.height)) / Math.min(shape.width, shape.height)
  )
  return shape.width >= shape.height
    ? { width: longEdge, height: shortEdge }
    : { width: shortEdge, height: longEdge }
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
    ...pixelSize(composition.shortEdge, shape),
    conditions: composition.frames.map((frame) => ({
      type: "image",
      role: "keyframe",
      at: frame.role === "first" ? "first frame" : "last frame",
      fileName: frame.fileName,
      fromAsset: frame.assetName,
    })),
  }
}
