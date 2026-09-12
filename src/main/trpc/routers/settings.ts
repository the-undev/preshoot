import { z } from "zod"
import { PromptServiceError } from "../../core/prompting/errors"
import type { ServerModel } from "../../core/prompting/llama-server-client"
import { llamaServerUrlSchema } from "../../core/settings/app-settings"
import { publicProcedure, router } from "../trpc"

/** What a server had to say when it was asked, models included when it answered. */
interface ServerReport {
  state: "ok" | "loading" | "unreachable"
  models: ServerModel[]
}

export const settingsRouter = router({
  /** App-level settings the renderer can show. */
  get: publicProcedure.query(({ ctx }) => ({
    llamaServerUrl: ctx.settings.llamaServerUrl(),
    llamaModel: ctx.settings.llamaModel(),
  })),

  /** Points the app at a different llama-server, or a different model on it. */
  update: publicProcedure
    .input(z.object({ llamaServerUrl: llamaServerUrlSchema, llamaModel: z.string() }))
    .mutation(({ ctx, input }) => {
      ctx.settings.setLlamaServerUrl(input.llamaServerUrl)
      ctx.settings.setLlamaModel(input.llamaModel)
      return {
        llamaServerUrl: ctx.settings.llamaServerUrl(),
        llamaModel: ctx.settings.llamaModel(),
      }
    }),

  /** What the saved server can serve, asked for whenever the dialog is opened. */
  models: publicProcedure.query(async ({ ctx }): Promise<ServerReport> => {
    const client = ctx.promptClient(ctx.settings.llamaServerUrl())
    try {
      const state = await client.health()
      return { state, models: state === "ok" ? await client.models() : [] }
    } catch (error) {
      if (error instanceof PromptServiceError && error.code === "unreachable") {
        return { state: "unreachable", models: [] }
      }
      throw error
    }
  }),

  /**
   * Whether a llama-server answers at `url`, and what it can serve. The URL comes from the caller
   * rather than settings so the dialog can look before saving, and a server that is down is an
   * answer rather than a failure.
   */
  checkLlamaServer: publicProcedure
    .input(z.object({ url: llamaServerUrlSchema }))
    .mutation(async ({ ctx, input }): Promise<ServerReport> => {
      const client = ctx.promptClient(input.url)
      try {
        const state = await client.health()
        return { state, models: state === "ok" ? await client.models() : [] }
      } catch (error) {
        if (error instanceof PromptServiceError && error.code === "unreachable") {
          return { state: "unreachable", models: [] }
        }
        throw error
      }
    }),

  /** Frees a loaded model, which hands the card back without stopping the server. */
  unloadModel: publicProcedure
    .input(z.object({ url: llamaServerUrlSchema, modelId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const client = ctx.promptClient(input.url)
      await client.unload(input.modelId)
      return { models: await client.models() }
    }),
})
