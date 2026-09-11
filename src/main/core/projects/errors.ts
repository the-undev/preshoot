/** Why a project folder could not be opened or created. */
export type ProjectErrorCode = "not-a-project" | "invalid-marker" | "already-a-project"

/** A project folder failure the renderer can present to the user. */
export class ProjectError extends Error {
  readonly code: ProjectErrorCode

  constructor(code: ProjectErrorCode, message: string) {
    super(message)
    this.name = "ProjectError"
    this.code = code
  }
}
