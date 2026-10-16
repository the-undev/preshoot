import { z } from "zod"
import type { ComfyUiStatus } from "../../core/backend/comfyui-client"
import { PromptServiceError } from "../../core/prompting/errors"
import type { ServerModel } from "../../core/prompting/llama-server-client"
import { comfyUiUrlSchema, llamaServerUrlSchema } from "../../core/settings/app-settings"
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
    comfyUiUrl: ctx.settings.comfyUiUrl(),
    workflowsFolder: ctx.settings.workflowsFolder(),
  })),

  /**
   * Points the app at a different llama-server, a different model on it, a different ComfyUI, or a
   * different workflows folder.
   */
  update: publicProcedure
    .input(
      z.object({
        llamaServerUrl: llamaServerUrlSchema,
        llamaModel: z.string(),
        comfyUiUrl: comfyUiUrlSchema,
        workflowsFolder: z.string().trim().min(1).nullable(),
      })
    )
    .mutation(({ ctx, input }) => {
      ctx.settings.setLlamaServerUrl(input.llamaServerUrl)
      ctx.settings.setLlamaModel(input.llamaModel)
      ctx.settings.setComfyUiUrl(input.comfyUiUrl)
      ctx.settings.setWorkflowsFolder(input.workflowsFolder)
      return {
        llamaServerUrl: ctx.settings.llamaServerUrl(),
        llamaModel: ctx.settings.llamaModel(),
        comfyUiUrl: ctx.settings.comfyUiUrl(),
        workflowsFolder: ctx.settings.workflowsFolder(),
      }
    }),

  /** Asks for a workflows folder and hands it back without saving it, for the form to show. */
  pickWorkflowsFolder: publicProcedure.mutation(({ ctx }) =>
    ctx.dialogs.pickDirectory({ title: "Choose the workflows folder", allowCreate: false })
  ),

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

  /** Whether the saved ComfyUI answers, asked for whenever the dialog is opened. */
  comfyUiStatus: publicProcedure.query(({ ctx }): Promise<ComfyUiStatus> =>
    ctx.comfyUiClient(ctx.settings.comfyUiUrl()).status()
  ),

  /** Whether a ComfyUI answers at `url`, so the dialog can look before saving. */
  checkComfyUi: publicProcedure
    .input(z.object({ url: comfyUiUrlSchema }))
    .mutation(({ ctx, input }): Promise<ComfyUiStatus> => ctx.comfyUiClient(input.url).status()),

  /** Frees a loaded model, which hands the card back without stopping the server. */
  unloadModel: publicProcedure
    .input(z.object({ url: llamaServerUrlSchema, modelId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const client = ctx.promptClient(input.url)
      await client.unload(input.modelId)
      return { models: await client.models() }
    }),
})
