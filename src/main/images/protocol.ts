import { readFileSync } from "node:fs"
import { protocol } from "electron"
import { readImage } from "../core/composition/image-store"
import type { ProjectSession } from "../core/projects/session"

/** Scheme the renderer reads pictures through; a picture's URL is `asset://<id>`. */
export const ASSET_SCHEME = "asset"

/** Must run before app ready, the same as the trpc scheme. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ])
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
      return new Response(readFileSync(path), {
        headers: { "content-type": image.mediaType, "cache-control": "no-cache" },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
