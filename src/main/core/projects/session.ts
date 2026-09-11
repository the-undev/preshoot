import type { OpenProject } from "./project"

/** Holds the one project the app has open. */
export class ProjectSession {
  private project: OpenProject | null = null

  /** The open project, or null when the app is on the welcome screen. */
  current(): OpenProject | null {
    return this.project
  }

  /** Makes `project` the open one, closing whatever was open before. */
  replace(project: OpenProject): void {
    this.close()
    this.project = project
  }

  /** Closes the open project, if there is one. */
  close(): void {
    this.project?.close()
    this.project = null
  }
}
