import { TRPCError } from "@trpc/server"
import { z } from "zod"
import type { ProjectDatabase } from "../../core/db"
import { briefComposer } from "../../core/prompting/composers/brief"
import { PromptServiceError } from "../../core/prompting/errors"
import { insertGeneration, listGenerations } from "../../core/prompting/generation-store"
import { minimaxH3 } from "../../core/prompting/targets/minimax-h3"
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
        // Clips arrive in step 5; until then the brief stands in for a clip with nothing but a note.
        const composed = await briefComposer.compose({
          composition: {
            id: 0,
            name: "",
            style: "",
            note: input.brief,
            musicNote: "",
            speakers: [],
            shots: [],
          },
          target: minimaxH3,
          client: ctx.promptClient(ctx.settings.llamaServerUrl()),
          scope: { kind: "all" },
        })
        return insertGeneration(db, {
          target: TARGET,
          brief: input.brief,
          fields: composed.fields,
          rendered: composed.rendered,
          model: composed.model ?? "",
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Every prompt generated in the open project, newest first. */
  list: publicProcedure.query(({ ctx }) => listGenerations(requireProject(ctx))),
})
