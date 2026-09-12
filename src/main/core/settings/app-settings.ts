import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { z } from "zod"
import { projectMarkerPath } from "../projects/marker"
import type { ProjectSummary } from "../projects/project"

/** How many projects the recent list keeps. */
const RECENT_PROJECT_LIMIT = 20

/** Where llama-server listens when the user has not said otherwise. */
export const DEFAULT_LLAMA_SERVER_URL = "http://127.0.0.1:8080"

/** An http URL the app can fetch from. A bare `host:port` parses as a URL of its own scheme, so the protocol is checked. */
export const llamaServerUrlSchema = z.url({ protocol: /^https?$/ })

/** One entry in the recent projects list. */
export const recentProjectSchema = z.object({
  directory: z.string().min(1),
  name: z.string().min(1),
  lastOpenedAt: z.iso.datetime(),
})

export type RecentProject = z.infer<typeof recentProjectSchema>

/** Contents of the app settings file. */
export const appSettingsSchema = z.object({
  recentProjects: z.array(recentProjectSchema).default([]),
  llamaServerUrl: llamaServerUrlSchema.default(DEFAULT_LLAMA_SERVER_URL),
})

export type AppSettings = z.infer<typeof appSettingsSchema>

const defaultSettings: AppSettings = appSettingsSchema.parse({})

/** Reads and writes the settings file that holds app-level state such as recent projects. */
export class AppSettingsStore {
  private readonly settingsPath: string

  constructor(settingsPath: string) {
    this.settingsPath = settingsPath
  }

  /** Current settings, or defaults when the file is missing or cannot be understood. */
  read(): AppSettings {
    if (!existsSync(this.settingsPath)) {
      return defaultSettings
    }
    try {
      const settings = appSettingsSchema.safeParse(
        JSON.parse(readFileSync(this.settingsPath, "utf8"))
      )
      return settings.success ? settings.data : defaultSettings
    } catch {
      return defaultSettings
    }
  }

  /** Changes the fields in `patch` and leaves the rest of the file as it was. */
  update(patch: Partial<AppSettings>): void {
    this.write({ ...this.read(), ...patch })
  }

  /** The URL of the llama-server the app generates through. */
  llamaServerUrl(): string {
    return this.read().llamaServerUrl
  }

  /** Points the app at a different llama-server. */
  setLlamaServerUrl(url: string): void {
    this.update({ llamaServerUrl: url })
  }

  /** Replaces the settings file, writing beside it first so a failed write leaves the old file intact. */
  private write(settings: AppSettings): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true })
    const temporaryPath = `${this.settingsPath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8")
    renameSync(temporaryPath, this.settingsPath)
  }

  /** Puts `project` at the front of the recent list, moving it if it is already there. */
  recordRecentProject(project: ProjectSummary): void {
    const settings = this.read()
    const entry: RecentProject = {
      directory: project.directory,
      name: project.name,
      lastOpenedAt: new Date().toISOString(),
    }
    const others = settings.recentProjects.filter((recent) => recent.directory !== entry.directory)
    this.update({ recentProjects: [entry, ...others].slice(0, RECENT_PROJECT_LIMIT) })
  }

  /** Recent projects that still exist on disk, newest first, pruning the file when any have gone. */
  listRecentProjects(): RecentProject[] {
    const settings = this.read()
    const present = settings.recentProjects.filter((recent) =>
      existsSync(projectMarkerPath(recent.directory))
    )
    if (present.length !== settings.recentProjects.length) {
      this.update({ recentProjects: present })
    }
    return present
  }
}
