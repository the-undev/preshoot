import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { z } from "zod"
import { projectMarkerPath } from "../projects/marker"
import type { ProjectSummary } from "../projects/project"

/** How many projects the recent list keeps. */
const RECENT_PROJECT_LIMIT = 20

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
})

export type AppSettings = z.infer<typeof appSettingsSchema>

const defaultSettings: AppSettings = { recentProjects: [] }

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

  /** Replaces the settings file, writing beside it first so a failed write leaves the old file intact. */
  write(settings: AppSettings): void {
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
    this.write({ recentProjects: [entry, ...others].slice(0, RECENT_PROJECT_LIMIT) })
  }

  /** Recent projects that still exist on disk, newest first, pruning the file when any have gone. */
  listRecentProjects(): RecentProject[] {
    const settings = this.read()
    const present = settings.recentProjects.filter((recent) =>
      existsSync(projectMarkerPath(recent.directory))
    )
    if (present.length !== settings.recentProjects.length) {
      this.write({ recentProjects: present })
    }
    return present
  }
}
