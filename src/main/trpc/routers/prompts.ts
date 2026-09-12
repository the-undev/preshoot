import { TRPCError } from "@trpc/server"
import { z } from "zod"
import type { ProjectDatabase } from "../../core/db"
import { PromptServiceError } from "../../core/prompting/errors"
import { generateH3Prompt } from "../../core/prompting/generate"
import { insertGeneration, listGenerations } from "../../core/prompting/generation-store"
import type { Context } from "../context"
import { publicProcedure, router } from "../trpc"

/** Which target these prompts are written for. Reference image forms arrive with the asset library. */
const TARGET = "minimax-h3"

/** The open project's database, or a refusal the renderer can show. */
function requireProject(ctx: Context): ProjectDatabase {
  const project = ctx.projects.current()
  if (!project) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Open a project before generating a prompt.",
    })
  }
  return project.db
}

/** Rethrows a prompt server failure with its message, since the message already says what to do. */
function asClientError(error: unknown): never {
  if (error instanceof PromptServiceError) {
    throw new TRPCError({
      code: error.code === "bad-response" ? "BAD_GATEWAY" : "SERVICE_UNAVAILABLE",
      message: error.message,
      cause: error,
    })
  }
  throw error
}

export const promptsRouter = router({
  /** Writes a prompt for `brief` and keeps it in the project. */
  generate: publicProcedure
    .input(z.object({ brief: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        const generated = await generateH3Prompt(
          ctx.promptClient(ctx.settings.llamaServerUrl()),
          input.brief
        )
        return insertGeneration(db, {
          target: TARGET,
          brief: input.brief,
          fields: generated.fields,
          rendered: generated.rendered,
          model: generated.model,
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Every prompt generated in the open project, newest first. */
  list: publicProcedure.query(({ ctx }) => listGenerations(requireProject(ctx))),
})
