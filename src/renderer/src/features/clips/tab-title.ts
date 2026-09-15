import type { OpenTab } from "@renderer/lib/trpc"

/** What a tab showing the list of clips is called. */
const CLIP_LIST = "Clips"

/** What a clip with no name is called until something happens in it. */
const UNTITLED = "Untitled clip"

/** How much of the first thing that happens fits in a tab. */
const TITLE_LENGTH = 32

/** What a tab is called: its clip's name, what happens first in it, or that it has neither. */
export function tabTitle(tab: OpenTab): string {
  if (tab.clipId === null) return CLIP_LIST
  if (tab.clipName !== null) return tab.clipName
  if (tab.firstBeat === null) return UNTITLED
  return tab.firstBeat.length > TITLE_LENGTH
    ? `${tab.firstBeat.slice(0, TITLE_LENGTH).trimEnd()}…`
    : tab.firstBeat
}
