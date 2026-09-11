import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_MARKER_FILENAME } from "../../core/projects/marker"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import type { Context, Dialogs } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("projects router", () => {
  let dir: string
  let session: ProjectSession
  let pickDirectory: Dialogs["pickDirectory"]
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-router-"))
    session = new ProjectSession()
    pickDirectory = vi.fn(async () => join(dir, "picked"))
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      settings: new AppSettingsStore(join(dir, "settings.json")),
      migrationsFolder,
      dialogs: { pickDirectory: (options) => pickDirectory(options) },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function projectFolder(name: string): string {
    return join(dir, name)
  }

  it("reports no open project and no recent projects to start with", async () => {
    expect(await caller.projects.current()).toBeNull()
    expect(await caller.projects.recent()).toEqual([])
  })

  it("creates a project, opens it and records it", async () => {
    const directory = projectFolder("new-film")

    const created = await caller.projects.create({ directory, name: "New film" })

    expect(created.name).toBe("New film")
    expect(await caller.projects.current()).toEqual(created)
    expect(await caller.projects.recent()).toEqual([
      expect.objectContaining({ directory, name: "New film" }),
    ])
  })

  it("refuses to create a project where one already exists", async () => {
    const directory = projectFolder("twice")
    await caller.projects.create({ directory, name: "First" })

    await expect(caller.projects.create({ directory, name: "Second" })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
  })

  it("opens an existing project and moves it to the front of the recent list", async () => {
    const first = projectFolder("first")
    const second = projectFolder("second")
    await caller.projects.create({ directory: first, name: "First" })
    await caller.projects.create({ directory: second, name: "Second" })

    const opened = await caller.projects.open({ directory: first })

    expect(opened.name).toBe("First")
    expect((await caller.projects.recent()).map((recent) => recent.directory)).toEqual([
      first,
      second,
    ])
  })

  it("rejects opening a folder that is not a project", async () => {
    const directory = projectFolder("plain")
    mkdirSync(directory, { recursive: true })

    await expect(caller.projects.open({ directory })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
    expect(await caller.projects.current()).toBeNull()
  })

  it("rejects opening a folder whose marker is broken", async () => {
    const directory = projectFolder("broken")
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, PROJECT_MARKER_FILENAME), "{}", "utf8")

    await expect(caller.projects.open({ directory })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
  })

  it("closes the open project", async () => {
    await caller.projects.create({ directory: projectFolder("closing"), name: "Closing" })

    await caller.projects.close()

    expect(await caller.projects.current()).toBeNull()
  })

  it("asks for a new folder when the purpose is create", async () => {
    const picked = await caller.projects.pickDirectory({ purpose: "create" })

    expect(picked).toBe(join(dir, "picked"))
    expect(pickDirectory).toHaveBeenCalledWith(expect.objectContaining({ allowCreate: true }))
  })

  it("asks for an existing folder when the purpose is open", async () => {
    await caller.projects.pickDirectory({ purpose: "open" })

    expect(pickDirectory).toHaveBeenCalledWith(expect.objectContaining({ allowCreate: false }))
  })

  it("returns null when the picker is cancelled", async () => {
    pickDirectory = vi.fn(async () => null)

    expect(await caller.projects.pickDirectory({ purpose: "open" })).toBeNull()
  })
})
