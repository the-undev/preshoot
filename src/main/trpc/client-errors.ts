import { TRPCError } from "@trpc/server"
import { CompositionError } from "../core/composition/errors"
import { PromptServiceError } from "../core/prompting/errors"

/** How a refusal from the composition layer reaches the renderer. */
const COMPOSITION_CODES = {
  "not-found": "NOT_FOUND",
  "in-use": "CONFLICT",
  "nothing-to-write": "BAD_REQUEST",
} as const

/** How a failure talking to the prompt server reaches the renderer. */
const PROMPT_CODES = {
  unreachable: "SERVICE_UNAVAILABLE",
  loading: "SERVICE_UNAVAILABLE",
  "bad-response": "BAD_GATEWAY",
  timeout: "TIMEOUT",
} as const

/**
 * Rethrows a failure the user can act on with its own message, since those messages already say
 * what to do. Anything else goes up as it is.
 */
export function asClientError(error: unknown): never {
  if (error instanceof CompositionError) {
    throw new TRPCError({
      code: COMPOSITION_CODES[error.code],
      message: error.message,
      cause: error,
    })
  }
  if (error instanceof PromptServiceError) {
    throw new TRPCError({ code: PROMPT_CODES[error.code], message: error.message, cause: error })
  }
  throw error
}
