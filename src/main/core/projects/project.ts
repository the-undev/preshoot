import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { openProjectDatabase, type ProjectDatabase } from "../db"
import { ProjectError } from "./errors"
import {
  PROJECT_MARKER_FILENAME,
  projectDatabasePath,
  projectMarkerPath,
  readProjectMarker,
  writeProjectMarker,
  type ProjectMarker,
} from "./marker"

/** Folders every project holds alongside the marker and the database. */
const PROJECT_SUBFOLDERS = ["assets", "outputs", "exports"]

/** What the renderer needs to describe a project without holding it open. */
export interface ProjectSummary {
  directory: string
  name: string
  createdAt: string
}

/** A project with its database open. */
export interface OpenProject extends ProjectSummary {
  db: ProjectDatabase
  close(): void
}

/** Creates a project in `directory`, throwing `already-a-project` when one is already there. */
export function createProject(input: {
  directory: string
  name: string
  migrationsFolder: string
}): OpenProject {
  if (existsSync(projectMarkerPath(input.directory))) {
    throw new ProjectError(
      "already-a-project",
      `${input.directory} already holds a ${PROJECT_MARKER_FILENAME}`
    )
  }

  const marker: ProjectMarker = {
    name: input.name,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
  }
  createProjectFolders(input.directory)
  writeProjectMarker(input.directory, marker)
  return openWithMarker(input.directory, marker, input.migrationsFolder)
}

/** Opens the project in `directory`, throwing when it holds no usable marker. */
export function openProject(input: { directory: string; migrationsFolder: string }): OpenProject {
  const marker = readProjectMarker(input.directory)
  createProjectFolders(input.directory)
  return openWithMarker(input.directory, marker, input.migrationsFolder)
}

function createProjectFolders(directory: string): void {
  mkdirSync(directory, { recursive: true })
  for (const subfolder of PROJECT_SUBFOLDERS) {
    mkdirSync(join(directory, subfolder), { recursive: true })
  }
}

function openWithMarker(
  directory: string,
  marker: ProjectMarker,
  migrationsFolder: string
): OpenProject {
  const { db, close } = openProjectDatabase(projectDatabasePath(directory), migrationsFolder)
  return {
    directory,
    name: marker.name,
    createdAt: marker.createdAt,
    db,
    close,
  }
}
