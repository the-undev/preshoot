/** Why a change to a clip or the library could not be made. */
export type CompositionErrorCode = "not-found" | "in-use" | "nothing-to-write"

/** A refusal the renderer can show, raised by the stores and by the composers. */
export class CompositionError extends Error {
  readonly code: CompositionErrorCode

  constructor(code: CompositionErrorCode, message: string) {
    super(message)
    this.name = "CompositionError"
    this.code = code
  }

  /** Nothing was asked for that does not exist. */
  static notFound(what: string): CompositionError {
    return new CompositionError("not-found", `${what} is not in this project.`)
  }

  /** A library entry cannot go while a shot still shows it. */
  static inUse(what: string, where: string): CompositionError {
    return new CompositionError("in-use", `${what} is still shown in ${where}.`)
  }

  /** There is nothing for the model to work from. */
  static nothingToWrite(message: string): CompositionError {
    return new CompositionError("nothing-to-write", message)
  }
}
