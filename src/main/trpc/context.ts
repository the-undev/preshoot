import type { ProjectSession } from "../core/projects/session"
import type { AppSettingsStore } from "../core/settings/app-settings"

/** Values every procedure can reach. Built once per request by the protocol handler. */
export interface Context {
  versions: RuntimeVersions
  projects: ProjectSession
  settings: AppSettingsStore
  migrationsFolder: string
  dialogs: Dialogs
}

/** Runtime versions shown on the welcome screen and in bug reports. */
export interface RuntimeVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

/** Native pickers the renderer drives through the router. */
export interface Dialogs {
  pickDirectory(options: { title: string; allowCreate: boolean }): Promise<string | null>
}
