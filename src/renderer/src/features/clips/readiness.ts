import type { ClipComposition } from "@renderer/lib/trpc"

/** What a form needs before it can be written. */
const FRAME_NEEDS: Record<string, { role: "first" | "last"; said: string }[]> = {
  t2v: [],
  i2v: [{ role: "first", said: "Choose the picture this clip opens on." }],
  fl2v: [
    { role: "first", said: "Choose the picture this clip opens on." },
    { role: "last", said: "Choose the picture this clip ends on." },
  ],
  l2v: [{ role: "last", said: "Choose the picture this clip ends on." }],
}

/** Everything standing between this clip and a prompt, said plainly beside the editor. */
export function clipReadiness(composition: ClipComposition): string[] {
  const missing: string[] = []

  if (composition.shots.length === 0) {
    missing.push("This clip has no shots.")
  }

  const empty = composition.shots
    .map((shot, index) => ({ number: index + 1, lines: shot.lines }))
    .filter((shot) => !shot.lines.some((line) => line.text.trim().length > 0))
  if (empty.length > 0) {
    const numbers = empty.map((shot) => shot.number).join(", ")
    missing.push(
      empty.length === 1
        ? `Shot ${numbers} has nothing happening in it.`
        : `Shots ${numbers} have nothing happening in them.`
    )
  }

  for (const need of FRAME_NEEDS[composition.form] ?? []) {
    if (!composition.frames.some((frame) => frame.role === need.role)) {
      missing.push(need.said)
    }
  }

  return missing
}
