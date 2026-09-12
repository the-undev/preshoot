/** What was written for one shot, without any of the markers the app puts around it. */
export interface ShotProse {
  shotId: number
  prose: string
}

/** The prose of a whole clip: one piece per shot, plus the two clip-level fields. */
export interface ClipProse {
  shots: ShotProse[]
  soundscape: string
  music: string
}
