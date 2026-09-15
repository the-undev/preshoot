import { readFileSync } from "node:fs"
import { nativeImage, protocol } from "electron"
import { readImage } from "../core/composition/image-store"
import { ASSET_SCHEME } from "../schemes"
import type { ProjectSession } from "../core/projects/session"

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
      const width = widthFrom(request.url)
      if (width === null) {
        return new Response(readFileSync(path), {
          headers: { "content-type": image.mediaType, "cache-control": "no-cache" },
        })
      }

      // Drawn small, so the page is not made to read a whole photograph to fill a thumbnail.
      const full = nativeImage.createFromPath(path)
      const small = full.isEmpty() ? full : full.resize({ width, quality: "good" })
      const body = small.isEmpty() ? readFileSync(path) : small.toPNG()
      return new Response(new Uint8Array(body), {
        headers: {
          "content-type": small.isEmpty() ? image.mediaType : "image/png",
          "cache-control": "no-cache",
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
