import { TRPCError } from "@trpc/server"
import { BackendError } from "../core/backend/errors"
import { CompositionError } from "../core/composition/errors"
import { DispatchError } from "../core/dispatch/errors"
import { PromptServiceError } from "../core/prompting/errors"
import { WorkflowError } from "../core/workflows/errors"

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

/** How a refusal from the workflow store reaches the renderer. */
const WORKFLOW_CODES = {
  "not-found": "NOT_FOUND",
  unreadable: "BAD_REQUEST",
  "already-imported": "CONFLICT",
  "outside-folder": "BAD_REQUEST",
  stale: "CONFLICT",
} as const

/** How a failure talking to ComfyUI reaches the renderer. */
const BACKEND_CODES = {
  unreachable: "SERVICE_UNAVAILABLE",
  "bad-response": "BAD_GATEWAY",
  timeout: "TIMEOUT",
  refused: "BAD_REQUEST",
} as const

/** How a refusal to build, send or follow a run reaches the renderer. */
const DISPATCH_CODES = {
  "not-found": "NOT_FOUND",
  unresolvable: "BAD_REQUEST",
  refused: "BAD_REQUEST",
  "unreadable-file": "BAD_REQUEST",
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
  if (error instanceof WorkflowError) {
    throw new TRPCError({ code: WORKFLOW_CODES[error.code], message: error.message, cause: error })
  }
  if (error instanceof BackendError) {
    throw new TRPCError({ code: BACKEND_CODES[error.code], message: error.message, cause: error })
  }
  if (error instanceof DispatchError) {
    throw new TRPCError({ code: DISPATCH_CODES[error.code], message: error.message, cause: error })
  }
  throw error
}
