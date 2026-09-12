/** Why a prompt request failed. */
export type PromptServiceErrorCode = "unreachable" | "loading" | "bad-response" | "timeout"

/** A failure talking to the prompt server, carrying a message the user can act on. */
export class PromptServiceError extends Error {
  readonly code: PromptServiceErrorCode

  constructor(code: PromptServiceErrorCode, message: string) {
    super(message)
    this.name = "PromptServiceError"
    this.code = code
  }

  /** The server did not answer, so the message names the URL that was tried. */
  static unreachable(baseUrl: string): PromptServiceError {
    return new PromptServiceError(
      "unreachable",
      `No answer from llama-server at ${baseUrl}. Check that it is running and that the URL in settings is right.`
    )
  }

  /** The request was abandoned before the server answered. */
  static timeout(seconds: number): PromptServiceError {
    return new PromptServiceError(
      "timeout",
      `llama-server did not answer within ${seconds} seconds. A shorter clip, or a smaller model, may finish in time.`
    )
  }

  /** The server is up but has not finished loading its model. */
  static loading(): PromptServiceError {
    return new PromptServiceError(
      "loading",
      "llama-server is still loading its model. Try again in a moment."
    )
  }

  /** The server answered with something the app could not read. */
  static badResponse(): PromptServiceError {
    return new PromptServiceError(
      "bad-response",
      "llama-server answered with something the app could not read."
    )
  }
}
