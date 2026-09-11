import { existsSync, mkdirSync, readdirSync } from "node:fs"
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

/** Whether `name` can be a folder name: one segment, not a relative path. */
export function isUsableFolderName(name: string): boolean {
  return !/[/\\]/.test(name) && name !== "." && name !== ".."
}

/**
 * Creates a project in `directory`. Throws `already-a-project` when one is already there and
 * `not-empty` when the folder holds anything else, unless `allowNonEmpty` says to go ahead.
 */
export function createProject(input: {
  directory: string
  name: string
  migrationsFolder: string
  allowNonEmpty: boolean
}): OpenProject {
  if (existsSync(projectMarkerPath(input.directory))) {
    throw new ProjectError(
      "already-a-project",
      `${input.directory} already holds a ${PROJECT_MARKER_FILENAME}`
    )
  }

  const entries = input.allowNonEmpty ? 0 : countEntries(input.directory)
  if (entries > 0) {
    throw new ProjectError(
      "not-empty",
      `${input.directory} holds ${entries} ${entries === 1 ? "entry" : "entries"}`
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

/** How many entries `directory` holds, dotfiles included, and zero when it does not exist. */
function countEntries(directory: string): number {
  return existsSync(directory) ? readdirSync(directory).length : 0
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
