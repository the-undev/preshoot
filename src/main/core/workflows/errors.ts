/** Why a workflow could not be read, imported or updated. */
export type WorkflowErrorCode =
  "not-found" | "unreadable" | "already-imported" | "outside-folder" | "stale"

/** A refusal the renderer can show, raised by the workflow scan and store. */
export class WorkflowError extends Error {
  readonly code: WorkflowErrorCode

  constructor(code: WorkflowErrorCode, message: string) {
    super(message)
    this.name = "WorkflowError"
    this.code = code
  }

  /** Nothing was asked for that does not exist. */
  static notFound(what: string): WorkflowError {
    return new WorkflowError("not-found", `${what} is not in this project.`)
  }

  /** The file is not a ComfyUI workflow the app can read. */
  static unreadable(path: string, reason: string): WorkflowError {
    return new WorkflowError("unreadable", `${path} could not be read as a workflow: ${reason}`)
  }

  /** The file is already in the project, so its changes come in as an update instead. */
  static alreadyImported(path: string): WorkflowError {
    return new WorkflowError(
      "already-imported",
      `${path} is already in this project. Open it to take its changes.`
    )
  }

  /** Only files in the workflows folder can be imported. */
  static outsideFolder(path: string): WorkflowError {
    return new WorkflowError(
      "outside-folder",
      `${path} is not in the workflows folder named in settings.`
    )
  }

  /** The source changed again after its changes were shown, so they no longer describe it. */
  static stale(): WorkflowError {
    return new WorkflowError(
      "stale",
      "The source file changed again since its changes were shown. Look at the new changes first."
    )
  }
}
