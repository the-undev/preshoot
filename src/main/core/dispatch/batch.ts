// Read by the renderer as well as main, so this module imports nothing from Node.

/** The most runs one batch queues. */
export const BATCH_LIMIT = 20

/** A seed JavaScript can hold exactly, which is all but the top bits ComfyUI's seeds allow. */
export function randomSeed(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
}
