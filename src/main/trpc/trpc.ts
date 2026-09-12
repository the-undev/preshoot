import { initTRPC } from "@trpc/server"
import { ZodError } from "zod"
import type { Context } from "./context"

/** One zod complaint as a line a person can read, rather than the whole error as JSON. */
function readableIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join(".")
      return field.length > 0 ? `${field}: ${issue.message}` : issue.message
    })
    .join("; ")
}

const t = initTRPC.context<Context>().create({
  // An input that fails the schema otherwise reaches the renderer as a JSON dump of zod issues.
  errorFormatter({ shape, error }) {
    if (error.cause instanceof ZodError) {
      return { ...shape, message: readableIssues(error.cause) }
    }
    return shape
  },
})

export const router = t.router
export const publicProcedure = t.procedure
