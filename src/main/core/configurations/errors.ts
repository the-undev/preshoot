/** Why a configuration could not be saved, read or changed. */
export type ConfigurationErrorCode = "not-found" | "unreadable-file"

/** A refusal the renderer can show, raised by the configuration store. */
export class ConfigurationError extends Error {
  readonly code: ConfigurationErrorCode

  constructor(code: ConfigurationErrorCode, message: string) {
    super(message)
    this.name = "ConfigurationError"
    this.code = code
  }

  /** Nothing was asked for that does not exist. */
  static notFound(what: string): ConfigurationError {
    return new ConfigurationError("not-found", `${what} is not in this project.`)
  }

  /** A file bound to a slot could not be copied into the project. */
  static unreadableFile(path: string): ConfigurationError {
    return new ConfigurationError("unreadable-file", `${path} could not be copied in.`)
  }
}
