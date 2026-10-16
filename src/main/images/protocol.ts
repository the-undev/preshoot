import { createReadStream, readFileSync, statSync } from "node:fs"
import { Readable } from "node:stream"
import { nativeImage, protocol } from "electron"
import { readImage } from "../core/composition/image-store"
import { byteRange, outputMediaType } from "../core/dispatch/serving"
import { resolveLibraryFile, resolveOutputFile } from "../core/library-folder/guard"
import { ASSET_SCHEME, LIBRARY_SCHEME, OUTPUT_SCHEME } from "../schemes"
import type { ProjectSession } from "../core/projects/session"
import type { AppSettingsStore } from "../core/settings/app-settings"

/** The widths a thumbnail may be asked for, so a URL cannot ask for an arbitrary amount of work. */
const THUMBNAIL_WIDTHS = [80, 160, 320]

/**
 * How wide the URL asked the picture to be, or nothing when it asked for the picture itself. A
 * width the app does not offer is served whole rather than refused.
 */
function widthFrom(url: string): number | null {
  const asked = Number(new URL(url).pathname.replace(/\//g, ""))
  return THUMBNAIL_WIDTHS.includes(asked) ? asked : null
}

/** A picture as a response, drawn `width` wide when one is asked for. */
function pictureResponse(path: string, mediaType: string, width: number | null): Response {
  if (width === null) {
    return new Response(readFileSync(path), {
      headers: { "content-type": mediaType, "cache-control": "no-cache" },
    })
  }

  // Drawn small, so the page is not made to read a whole photograph to fill a thumbnail.
  const full = nativeImage.createFromPath(path)
  const small = full.isEmpty() ? full : full.resize({ width, quality: "good" })
  const body = small.isEmpty() ? readFileSync(path) : small.toPNG()
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": small.isEmpty() ? mediaType : "image/png",
      "cache-control": "no-cache",
    },
  })
}

/**
 * Serves a picture out of the open project. Nothing outside it can be read: the id is looked up in
 * the open project's database, and the file name comes from there rather than from the URL.
 */
export function handleAssetRequests(projects: ProjectSession): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const project = projects.current()
    if (!project) {
      return new Response(null, { status: 404 })
    }

    const imageId = Number(new URL(request.url).hostname)
    if (!Number.isInteger(imageId)) {
      return new Response(null, { status: 404 })
    }

    try {
      const { image, path } = readImage(project.db, project.directory, imageId)
      return pictureResponse(path, image.mediaType, widthFrom(request.url))
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

/**
 * Serves a file out of the library folder named in settings, read-only. A URL is
 * `library://file/<relative path>`, with `?width=` for a picture's thumbnail. The path is resolved
 * and refused when it leads anywhere outside the folder, links included, or when no folder is set.
 * Anything but a thumbnail is streamed and answers range requests, so a sound can be played.
 */
export function handleLibraryRequests(settings: AppSettingsStore): void {
  protocol.handle(LIBRARY_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const path = resolveLibraryFile(
        settings.libraryFolder(),
        decodeURIComponent(url.pathname.slice(1))
      )
      if (path === null) {
        return new Response(null, { status: 404 })
      }

      const mediaType = outputMediaType(path)
      const width = Number(url.searchParams.get("width"))
      if (mediaType.startsWith("image/") && THUMBNAIL_WIDTHS.includes(width)) {
        return pictureResponse(path, mediaType, width)
      }
      return streamedResponse(path, mediaType, request.headers.get("range"))
    } catch {
      // A malformed URL or a file that went between the check and the read.
      return new Response(null, { status: 404 })
    }
  })
}

/**
 * Serves a file a run wrote, out of the open project's outputs folder, read-only. A URL is
 * `output://file/<path in the project>`, with `?width=` for a picture's thumbnail. The path is
 * refused when no project is open or it leads anywhere outside the outputs folder, links included.
 * Anything but a thumbnail is streamed and answers range requests, so a video can be scrubbed.
 */
export function handleOutputRequests(projects: ProjectSession): void {
  protocol.handle(OUTPUT_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const path = resolveOutputFile(
        projects.current()?.directory ?? null,
        decodeURIComponent(url.pathname.slice(1))
      )
      if (path === null) {
        return new Response(null, { status: 404 })
      }

      const mediaType = outputMediaType(path)
      const width = Number(url.searchParams.get("width"))
      if (mediaType.startsWith("image/") && THUMBNAIL_WIDTHS.includes(width)) {
        return pictureResponse(path, mediaType, width)
      }
      return streamedResponse(path, mediaType, request.headers.get("range"))
    } catch {
      // A malformed URL or a file that went between the check and the read.
      return new Response(null, { status: 404 })
    }
  })
}

/** A file as a stream, or the part of it a `Range` header asks for. */
function streamedResponse(path: string, mediaType: string, rangeHeader: string | null): Response {
  const size = statSync(path).size
  const range = byteRange(rangeHeader, size)
  if (range.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } })
  }

  const headers: Record<string, string> = {
    "content-type": mediaType,
    "accept-ranges": "bytes",
    "cache-control": "no-cache",
  }
  if (range.kind === "whole") {
    headers["content-length"] = String(size)
    return new Response(toWebStream(createReadStream(path)), { status: 200, headers })
  }
  headers["content-length"] = String(range.end - range.start + 1)
  headers["content-range"] = `bytes ${range.start}-${range.end}/${size}`
  return new Response(toWebStream(createReadStream(path, { start: range.start, end: range.end })), {
    status: 206,
    headers,
  })
}

function toWebStream(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>
}
