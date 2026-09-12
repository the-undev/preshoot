import { z } from "zod"
import { PromptServiceError } from "../../core/prompting/errors"
import { llamaServerUrlSchema } from "../../core/settings/app-settings"
import { publicProcedure, router } from "../trpc"

export const settingsRouter = router({
  /** App-level settings the renderer can show. */
  get: publicProcedure.query(({ ctx }) => ({ llamaServerUrl: ctx.settings.llamaServerUrl() })),

  /** Points the app at a different llama-server. */
  update: publicProcedure
    .input(z.object({ llamaServerUrl: llamaServerUrlSchema }))
    .mutation(({ ctx, input }) => {
      ctx.settings.setLlamaServerUrl(input.llamaServerUrl)
      return { llamaServerUrl: ctx.settings.llamaServerUrl() }
    }),

  /**
   * Whether a llama-server answers at `url`. The URL comes from the caller rather than settings so
   * the dialog can check before saving, and a server that is down is an answer rather than a failure.
   */
  checkLlamaServer: publicProcedure
    .input(z.object({ url: llamaServerUrlSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.promptClient(input.url).health()
      } catch (error) {
        if (error instanceof PromptServiceError && error.code === "unreachable") {
          return "unreachable" as const
        }
        throw error
      }
    }),
})
