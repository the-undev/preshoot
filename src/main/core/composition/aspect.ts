/** A shape a clip can be generated at, as the model takes it and as a person reads it. */
export interface AspectRatio {
  value: string
  name: string
  /** The two sides in the order the value writes them, for drawing the shape and sizing it. */
  width: number
  height: number
}

/**
 * The shapes offered, landscape first and then the same ratios turned on their side. A square is
 * in the list once, since turning it makes no difference.
 */
export const ASPECT_RATIOS: AspectRatio[] = [
  { value: "21:9", name: "Ultrawide", width: 21, height: 9 },
  { value: "16:9", name: "Widescreen", width: 16, height: 9 },
  { value: "4:3", name: "Classic", width: 4, height: 3 },
  { value: "1:1", name: "Square", width: 1, height: 1 },
  { value: "3:4", name: "Classic", width: 3, height: 4 },
  { value: "9:16", name: "Widescreen", width: 9, height: 16 },
  { value: "9:21", name: "Ultrawide", width: 9, height: 21 },
]

/** The shape a new clip is generated at. */
export const DEFAULT_ASPECT_RATIO = "16:9"

/** The short edge a clip is generated at unless it says otherwise, which the samples use. */
export const DEFAULT_SHORT_EDGE = 768
