import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProjectError } from "./errors"
import { PROJECT_DATABASE_FILENAME, PROJECT_MARKER_FILENAME } from "./marker"
import { createProject, openProject } from "./project"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("projects", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-project-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("creates the marker, the subfolders and the database", () => {
    const project = createProject({ directory: dir, name: "My film", migrationsFolder })
    project.close()

    expect(existsSync(join(dir, PROJECT_MARKER_FILENAME))).toBe(true)
    expect(existsSync(join(dir, PROJECT_DATABASE_FILENAME))).toBe(true)
    for (const subfolder of ["assets", "outputs", "exports"]) {
      expect(existsSync(join(dir, subfolder))).toBe(true)
    }
  })

  it("refuses to create a project where one already exists", () => {
    createProject({ directory: dir, name: "My film", migrationsFolder }).close()

    expect(() => createProject({ directory: dir, name: "Again", migrationsFolder })).toThrow(
      expect.objectContaining({ code: "already-a-project" })
    )
  })

  it("refuses to open a folder with no marker", () => {
    expect(() => openProject({ directory: dir, migrationsFolder })).toThrow(
      expect.objectContaining({ code: "not-a-project" })
    )
  })

  it("refuses to open a folder whose marker is broken", () => {
    writeFileSync(join(dir, PROJECT_MARKER_FILENAME), '{ "name": "" }', "utf8")

    expect(() => openProject({ directory: dir, migrationsFolder })).toThrow(
      expect.objectContaining({ code: "invalid-marker" })
    )
  })

  it("reports the same name and creation time when reopened", () => {
    const created = createProject({ directory: dir, name: "My film", migrationsFolder })
    created.close()

    const reopened = openProject({ directory: dir, migrationsFolder })
    reopened.close()

    expect(reopened.name).toBe("My film")
    expect(reopened.createdAt).toBe(created.createdAt)
    expect(reopened.directory).toBe(dir)
  })

  it("names the folder in the error it throws", () => {
    const error = (() => {
      try {
        openProject({ directory: dir, migrationsFolder })
        return null
      } catch (thrown) {
        return thrown
      }
    })()

    expect(error).toBeInstanceOf(ProjectError)
    expect((error as ProjectError).message).toContain(dir)
  })
})
