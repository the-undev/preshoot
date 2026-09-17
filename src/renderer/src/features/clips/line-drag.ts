import type { ShotComposition } from "@renderer/lib/trpc"

/**
 * Dragging a line reaches across the whole clip, so what is being dragged and what it is over have
 * to say which shot they belong to. Every shot's lines sit in one drag context held by the shot
 * list, and these names are how that context tells a line from a shot from an empty shot's room
 * for one.
 */

/** What a line is called while it is being dragged. */
export function lineId(shotId: number, at: number): string {
  return `line:${shotId}:${at}`
}

/** What a shot is called while it is being dragged. */
export function shotId(id: number): string {
  return `shot:${id}`
}

/** What the room for a shot's lines is called, which is where a line lands in an empty shot. */
export function linesOfShotId(id: number): string {
  return `lines:${id}`
}

/** Where a dragged line came from, or nothing when what is being dragged is not a line. */
export function lineAt(id: string): { shotId: number; at: number } | null {
  const parts = /^line:(\d+):(\d+)$/.exec(id)
  return parts ? { shotId: Number(parts[1]), at: Number(parts[2]) } : null
}

/** Which shot an id belongs to, whether it names a line, a shot, or room for one. */
export function shotOf(id: string): number | null {
  const parts = /^(?:line|shot|lines):(\d+)/.exec(id)
  return parts ? Number(parts[1]) : null
}

/** Where a line dropped on `over` should land: which shot, and how far down it. */
export function landingOf(
  over: string,
  from: { shotId: number; at: number },
  shots: ShotComposition[]
): { toShotId: number; toPosition: number } | null {
  const onto = lineAt(over)
  if (onto) {
    // Taking a line out from above where it is going shifts everything below it up one.
    const shifts = onto.shotId === from.shotId && from.at < onto.at
    return { toShotId: onto.shotId, toPosition: shifts ? onto.at - 1 : onto.at }
  }

  const shot = shotOf(over)
  if (shot === null) return null
  const lines = shots.find((one) => one.id === shot)?.lines.length ?? 0
  // Dropped on a shot rather than on one of its lines, so it goes on the end of it.
  return { toShotId: shot, toPosition: shot === from.shotId ? lines - 1 : lines }
}
