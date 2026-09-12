import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PROJECT_MARKER_FILENAME } from "../projects/marker"
import { AppSettingsStore, appSettingsSchema, DEFAULT_LLAMA_SERVER_URL } from "./app-settings"

describe("AppSettingsStore", () => {
  let dir: string
  let settingsPath: string
  let store: AppSettingsStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-settings-"))
    settingsPath = join(dir, "settings.json")
    store = new AppSettingsStore(settingsPath)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function makeProjectFolder(name: string): string {
    const directory = join(dir, name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, PROJECT_MARKER_FILENAME),
      JSON.stringify({ name, schemaVersion: 1, createdAt: new Date().toISOString() }),
      "utf8"
    )
    return directory
  }

  it("returns defaults when the file is missing", () => {
    expect(store.read()).toEqual({
      recentProjects: [],
      llamaServerUrl: DEFAULT_LLAMA_SERVER_URL,
    })
  })

  it("returns defaults when the file is not valid settings", () => {
    writeFileSync(settingsPath, "{ not json", "utf8")
    expect(store.read()).toEqual({
      recentProjects: [],
      llamaServerUrl: DEFAULT_LLAMA_SERVER_URL,
    })
  })

  it("reads a file without a server URL as the default one", () => {
    writeFileSync(settingsPath, JSON.stringify({ recentProjects: [] }), "utf8")

    expect(store.llamaServerUrl()).toBe(DEFAULT_LLAMA_SERVER_URL)
  })

  it("reads back the server URL it was given", () => {
    store.setLlamaServerUrl("http://192.168.1.20:9000")

    expect(store.llamaServerUrl()).toBe("http://192.168.1.20:9000")
  })

  it("keeps the recent projects when the server URL changes", () => {
    const directory = makeProjectFolder("kept")
    store.recordRecentProject({ directory, name: "Kept", createdAt: "" })

    store.setLlamaServerUrl("http://192.168.1.20:9000")

    expect(store.listRecentProjects().map((entry) => entry.directory)).toEqual([directory])
  })

  it("keeps the server URL when a project is recorded", () => {
    store.setLlamaServerUrl("http://192.168.1.20:9000")

    const directory = makeProjectFolder("kept")
    store.recordRecentProject({ directory, name: "Kept", createdAt: "" })

    expect(store.llamaServerUrl()).toBe("http://192.168.1.20:9000")
  })

  it("writes a file the schema accepts", () => {
    const directory = makeProjectFolder("first")
    store.recordRecentProject({ directory, name: "First", createdAt: new Date().toISOString() })

    const written = appSettingsSchema.safeParse(JSON.parse(readFileSync(settingsPath, "utf8")))
    expect(written.success).toBe(true)
  })

  it("moves an already recorded project to the front", () => {
    const first = makeProjectFolder("first")
    const second = makeProjectFolder("second")
    store.recordRecentProject({ directory: first, name: "First", createdAt: "" })
    store.recordRecentProject({ directory: second, name: "Second", createdAt: "" })
    store.recordRecentProject({ directory: first, name: "First", createdAt: "" })

    expect(store.listRecentProjects().map((recent) => recent.directory)).toEqual([first, second])
  })

  it("caps the list and drops the oldest entry", () => {
    const directories = Array.from({ length: 21 }, (_, index) => makeProjectFolder(`p${index}`))
    for (const directory of directories) {
      store.recordRecentProject({ directory, name: directory, createdAt: "" })
    }

    const recent = store.listRecentProjects()
    expect(recent).toHaveLength(20)
    expect(recent.map((entry) => entry.directory)).not.toContain(directories[0])
  })

  it("prunes projects whose folder has gone and writes the shorter list back", () => {
    const kept = makeProjectFolder("kept")
    const removed = makeProjectFolder("removed")
    store.recordRecentProject({ directory: kept, name: "Kept", createdAt: "" })
    store.recordRecentProject({ directory: removed, name: "Removed", createdAt: "" })
    rmSync(removed, { recursive: true, force: true })

    expect(store.listRecentProjects().map((entry) => entry.directory)).toEqual([kept])
    expect(store.read().recentProjects.map((entry) => entry.directory)).toEqual([kept])
  })

  it("prunes a folder that is no longer a project", () => {
    const directory = makeProjectFolder("emptied")
    store.recordRecentProject({ directory, name: "Emptied", createdAt: "" })
    rmSync(join(directory, PROJECT_MARKER_FILENAME))

    expect(store.listRecentProjects()).toEqual([])
  })
})
