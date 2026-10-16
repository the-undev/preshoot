import { extname } from "node:path"
import { IMAGE_MEDIA_TYPES } from "../composition/image-store"

/** The media type each kind of output file is served as. Anything else is plain bytes. */
const OUTPUT_MEDIA_TYPES: Record<string, string> = {
  ...IMAGE_MEDIA_TYPES,
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
}

/** What part of a file a request asked for. */
export type ByteRange =
  { kind: "whole" } | { kind: "part"; start: number; end: number } | { kind: "unsatisfiable" }

/** The media type an output file is served as, read from its extension whatever its case. */
export function outputMediaType(path: string): string {
  return OUTPUT_MEDIA_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"
}

/**
 * The bytes a `Range` header asks for out of a file `size` long, ends included. A header this
 * cannot read, or one asking for several ranges, gets the whole file, which HTTP allows.
 */
export function byteRange(header: string | null, size: number): ByteRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "")
  if (!match) return { kind: "whole" }
  const [, first, last] = match
  if (first === "" && last === "") return { kind: "whole" }

  if (first === "") {
    // A suffix: the last so many bytes.
    const length = Number(last)
    if (length === 0 || size === 0) return { kind: "unsatisfiable" }
    return { kind: "part", start: Math.max(0, size - length), end: size - 1 }
  }

  const start = Number(first)
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1)
  if (start >= size) return { kind: "unsatisfiable" }
  if (end < start) return { kind: "whole" }
  return { kind: "part", start, end }
}
