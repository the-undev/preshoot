import { extname } from "node:path"

/** What a file in the library holds, as far as its extension says. */
export type LibraryMedia = "image" | "audio" | "video" | "refmod" | "text" | "other"

/** Every extension the library recognises and what it holds. Anything else is `other`. */
const MEDIA_BY_EXTENSION: Record<string, LibraryMedia> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".wav": "audio",
  ".mp3": "audio",
  ".flac": "audio",
  ".ogg": "audio",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".safetensors": "refmod",
  ".txt": "text",
  ".md": "text",
}

/** What a file holds, read from its extension whatever its case. */
export function mediaOf(fileName: string): LibraryMedia {
  return MEDIA_BY_EXTENSION[extname(fileName).toLowerCase()] ?? "other"
}
