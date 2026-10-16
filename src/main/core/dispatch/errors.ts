/** Why a run could not be built, sent, followed or deleted. */
export type DispatchErrorCode =
  "not-found" | "unresolvable" | "refused" | "unreadable-file" | "nothing-to-cancel" | "unfinished"

/** A refusal the renderer can show, raised while a run is built, queued, polled or deleted. */
export class DispatchError extends Error {
  readonly code: DispatchErrorCode

  constructor(code: DispatchErrorCode, message: string) {
    super(message)
    this.name = "DispatchError"
    this.code = code
  }

  /** Nothing was asked for that does not exist. */
  static notFound(what: string): DispatchError {
    return new DispatchError("not-found", `${what} is not in this project.`)
  }

  /** The graph cannot be turned into a prompt ComfyUI runs, for the reason given. */
  static unresolvable(reason: string): DispatchError {
    return new DispatchError("unresolvable", `The workflow cannot be sent: ${reason}`)
  }

  /** ComfyUI answered and said no, in the words given. */
  static refused(reasons: string[]): DispatchError {
    return new DispatchError("refused", `ComfyUI refused the run: ${reasons.join(" ")}`)
  }

  /** A run asked to be cancelled is neither waiting nor running, so its end is left to a poll. */
  static nothingToCancel(runId: number): DispatchError {
    return new DispatchError(
      "nothing-to-cancel",
      `Run ${runId} is neither waiting nor running in ComfyUI, so there was nothing to cancel.`
    )
  }

  /** A run asked to be deleted may still write files, so it is cancelled first. */
  static unfinished(runId: number): DispatchError {
    return new DispatchError(
      "unfinished",
      `Run ${runId} is still queued or running. Cancel it before deleting it.`
    )
  }

  /** A file picked for a slot could not be read. */
  static unreadableFile(path: string): DispatchError {
    return new DispatchError("unreadable-file", `${path} could not be read.`)
  }
}
