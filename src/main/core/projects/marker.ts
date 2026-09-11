import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { ProjectError } from "./errors"

/** The file whose presence makes a folder a project. */
export const PROJECT_MARKER_FILENAME = "preshoot.json"

/** The SQLite database inside a project folder. */
export const PROJECT_DATABASE_FILENAME = "preshoot.db"

/** Contents of the marker file. */
export const projectMarkerSchema = z.object({
  name: z.string().min(1),
  schemaVersion: z.literal(1),
  createdAt: z.iso.datetime(),
})

export type ProjectMarker = z.infer<typeof projectMarkerSchema>

/** Path of the marker file inside `directory`. */
export function projectMarkerPath(directory: string): string {
  return join(directory, PROJECT_MARKER_FILENAME)
}

/** Path of the database file inside `directory`. */
export function projectDatabasePath(directory: string): string {
  return join(directory, PROJECT_DATABASE_FILENAME)
}

/** Reads the marker, throwing `ProjectError` when the folder is not a project or the file is malformed. */
export function readProjectMarker(directory: string): ProjectMarker {
  const path = projectMarkerPath(directory)
  if (!existsSync(path)) {
    throw new ProjectError("not-a-project", `No ${PROJECT_MARKER_FILENAME} in ${directory}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    throw new ProjectError(
      "invalid-marker",
      `${PROJECT_MARKER_FILENAME} in ${directory} is not JSON`
    )
  }

  const marker = projectMarkerSchema.safeParse(parsed)
  if (!marker.success) {
    throw new ProjectError(
      "invalid-marker",
      `${PROJECT_MARKER_FILENAME} in ${directory} is not a valid project marker`
    )
  }
  return marker.data
}

/** Writes the marker into `directory`, replacing any existing one. */
export function writeProjectMarker(directory: string, marker: ProjectMarker): void {
  writeFileSync(projectMarkerPath(directory), `${JSON.stringify(marker, null, 2)}\n`, "utf8")
}
