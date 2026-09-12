/** A shape a clip can be generated at, as the model takes it and as a person reads it. */
export interface AspectRatio {
  value: string
  name: string
}

/** The shapes offered. `auto` lets the model decide, which is what the sample requests use. */
export const ASPECT_RATIOS: AspectRatio[] = [
  { value: "auto", name: "Whatever suits (auto)" },
  { value: "16:9", name: "Landscape 16:9" },
  { value: "21:9", name: "Landscape wide 21:9" },
  { value: "4:3", name: "Landscape 4:3" },
  { value: "1:1", name: "Square 1:1" },
  { value: "3:4", name: "Portrait 3:4" },
  { value: "9:16", name: "Portrait 9:16" },
]

/** The short edge a clip is generated at unless it says otherwise, which the samples use. */
export const DEFAULT_SHORT_EDGE = 768

/** Short edges offered as suggestions. The model takes others, so this is a list, not a limit. */
export const SHORT_EDGES = [512, 768, 1080, 1440]
