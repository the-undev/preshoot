import type { LibraryMedia } from "@renderer/lib/trpc"

/** What each media type is called beside a file. */
export const MEDIA_LABELS: Record<LibraryMedia, string> = {
  image: "Image",
  audio: "Audio",
  video: "Video",
  refmod: "RefMod",
  text: "Text",
  other: "Other",
}
