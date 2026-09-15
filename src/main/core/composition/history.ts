import type { ClipComposition } from "./clip"

/** How many steps back one clip keeps. Enough to undo a run of mistakes, not a whole session. */
const DEPTH = 50

/** What a clip looked like before and after the changes that have been undone. */
interface Steps {
  past: ClipComposition[]
  future: ClipComposition[]
}

/**
 * What each open clip looked like before its recent changes. Held in memory rather than in the
 * project, because a clip is written as it is typed and the history is about this sitting rather
 * than about the project.
 */
export class ClipHistory {
  private readonly steps = new Map<number, Steps>()

  /** Keeps `before` as a step to come back to, and drops anything that had been undone. */
  remember(clipId: number, before: ClipComposition): void {
    const steps = this.of(clipId)
    steps.past.push(before)
    if (steps.past.length > DEPTH) steps.past.shift()
    steps.future = []
  }

  /** The step to go back to, given what the clip looks like now, or nothing when there is none. */
  back(clipId: number, now: ClipComposition): ClipComposition | null {
    const steps = this.of(clipId)
    const previous = steps.past.pop()
    if (!previous) return null
    steps.future.push(now)
    return previous
  }

  /** The step to go forward to, given what the clip looks like now, after going back. */
  forward(clipId: number, now: ClipComposition): ClipComposition | null {
    const steps = this.of(clipId)
    const next = steps.future.pop()
    if (!next) return null
    steps.past.push(now)
    return next
  }

  /** Whether there is anything to go back to or forward to, for the buttons that do it. */
  reach(clipId: number): { back: boolean; forward: boolean } {
    const steps = this.of(clipId)
    return { back: steps.past.length > 0, forward: steps.future.length > 0 }
  }

  /** Drops what a clip remembers, for when the clip itself goes. */
  forget(clipId: number): void {
    this.steps.delete(clipId)
  }

  private of(clipId: number): Steps {
    const steps = this.steps.get(clipId) ?? { past: [], future: [] }
    this.steps.set(clipId, steps)
    return steps
  }
}
