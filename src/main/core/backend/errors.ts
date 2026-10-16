/** Why a request to ComfyUI failed. */
export type BackendErrorCode = "unreachable" | "bad-response" | "timeout"

/** A failure talking to a ComfyUI instance, carrying a message the user can act on. */
export class BackendError extends Error {
  readonly code: BackendErrorCode

  constructor(code: BackendErrorCode, message: string) {
    super(message)
    this.name = "BackendError"
    this.code = code
  }

  /** The instance did not answer, so the message names the URL that was tried. */
  static unreachable(baseUrl: string): BackendError {
    return new BackendError(
      "unreachable",
      `No answer from ComfyUI at ${baseUrl}. Check that it is running and that the URL in settings is right.`
    )
  }

  /** The request was abandoned before the instance answered. */
  static timeout(seconds: number): BackendError {
    return new BackendError("timeout", `ComfyUI did not answer within ${seconds} seconds.`)
  }

  /** The instance answered with something the app could not read. */
  static badResponse(): BackendError {
    return new BackendError(
      "bad-response",
      "ComfyUI answered with something the app could not read."
    )
  }
}
