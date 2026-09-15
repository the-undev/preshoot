import type { AspectRatio } from "@renderer/lib/trpc"

/** Short edges offered as buttons. The model takes others, so this is a list, not a limit. */
export const SHORT_EDGES = [480, 512, 720, 1080, 1440]

/** Which way round a shape is. A square is neither, so it stays put when the others are turned. */
export type Orientation = "landscape" | "portrait"

/** Which way round this shape is, taking a square as landscape so a toggle always has an answer. */
export function orientationOf(shape: AspectRatio): Orientation {
  return shape.height > shape.width ? "portrait" : "landscape"
}

/** Whether this shape is the same either way round, in which case turning it does nothing. */
export function isSquare(shape: AspectRatio): boolean {
  return shape.width === shape.height
}

/** The shapes to offer for one orientation, squares included since they belong to both. */
export function shapesFacing(shapes: AspectRatio[], facing: Orientation): AspectRatio[] {
  return shapes.filter((shape) => isSquare(shape) || orientationOf(shape) === facing)
}

/** The same shape turned on its side, or the shape itself when turning makes no difference. */
export function turned(shapes: AspectRatio[], shape: AspectRatio): AspectRatio {
  if (isSquare(shape)) return shape
  return (
    shapes.find((other) => other.width === shape.height && other.height === shape.width) ?? shape
  )
}

/**
 * The size in pixels a clip generates at. The short edge is the smaller of the two sides, so the
 * other one follows from the shape. It matches what the request carries.
 */
export function pixelSize(
  shortEdge: number,
  shape: AspectRatio
): { width: number; height: number } {
  const longEdge = Math.round(
    (shortEdge * Math.max(shape.width, shape.height)) / Math.min(shape.width, shape.height)
  )
  return shape.width >= shape.height
    ? { width: longEdge, height: shortEdge }
    : { width: shortEdge, height: longEdge }
}
