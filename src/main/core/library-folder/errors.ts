/** Why the library could not be read from or written to. */
export type LibraryErrorCode =
  "unset" | "missing" | "not-found" | "not-text" | "not-image" | "exists" | "bad-name"

/** A refusal the renderer can show, raised when reading entries or writing one. */
export class LibraryError extends Error {
  readonly code: LibraryErrorCode

  constructor(code: LibraryErrorCode, message: string) {
    super(message)
    this.name = "LibraryError"
    this.code = code
  }

  /** No library folder is named in settings. */
  static unset(): LibraryError {
    return new LibraryError("unset", "Name a library folder in settings first.")
  }

  /** The folder named in settings is not there. */
  static missing(folder: string): LibraryError {
    return new LibraryError("missing", `The library folder is not there: ${folder}`)
  }

  /** Nothing in the library goes by that path. */
  static notFound(what: string): LibraryError {
    return new LibraryError("not-found", `${what} is not in the library.`)
  }

  /** The file asked for is not one the app reads as text. */
  static notText(what: string): LibraryError {
    return new LibraryError("not-text", `${what} is not a text file.`)
  }

  /** The file asked for is not a picture, so it is not opened. */
  static notImage(what: string): LibraryError {
    return new LibraryError("not-image", `${what} is not a picture.`)
  }

  /** An entry of that name is already there, and nothing is overwritten. */
  static exists(kind: string, name: string): LibraryError {
    return new LibraryError(
      "exists",
      `${kind} already holds an entry called ${name}. Nothing was written.`
    )
  }

  /** A name that cannot be a folder in the library. */
  static badName(message: string): LibraryError {
    return new LibraryError("bad-name", message)
  }
}
