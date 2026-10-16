import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { configurationNamesBinding } from "../../core/configurations/store"
import { listWorkflowFolder } from "../../core/workflows/folder"
import { SLOT_TIERS } from "../../core/workflows/scan"
import {
  applySourceUpdate,
  checkSource,
  importWorkflow,
  listWorkflows,
  readWorkflow,
  setSlotTier,
} from "../../core/workflows/store"
import { asClientError } from "../client-errors"
import { requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

const workflowId = z.number().int()

export const workflowsRouter = router({
  /** The workflow files in the folder named in settings, each marked when the project has it. */
  files: publicProcedure.query(({ ctx }) =>
    listWorkflowFolder(ctx.settings.workflowsFolder(), listWorkflows(requireProject(ctx)))
  ),

  /** Copies one file from the workflows folder into the project and scans its slots. */
  import: publicProcedure
    .input(z.object({ path: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      const folder = ctx.settings.workflowsFolder()
      if (folder === null) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Name a workflows folder in settings first.",
        })
      }
      try {
        return importWorkflow(db, { folder, sourcePath: input.path })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** The workflows the project holds, by name. */
  list: publicProcedure.query(({ ctx }) => listWorkflows(requireProject(ctx))),

  /** One workflow with its mapping and its guide. */
  get: publicProcedure.input(z.object({ workflowId })).query(({ ctx, input }) => {
    try {
      return readWorkflow(requireProject(ctx), input.workflowId)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Moves a slot to basic, advanced or hidden. */
  setTier: publicProcedure
    .input(z.object({ slotId: z.number().int(), tier: z.enum(SLOT_TIERS) }))
    .mutation(({ ctx, input }) => {
      try {
        return setSlotTier(requireProject(ctx), input.slotId, input.tier)
      } catch (error) {
        asClientError(error)
      }
    }),

  /**
   * Reads the source file again and says how it stands against the project's copy. A change
   * names the configurations that bind a slot it would remove.
   */
  checkSource: publicProcedure.input(z.object({ workflowId })).query(({ ctx, input }) => {
    try {
      const db = requireProject(ctx)
      const status = checkSource(db, input.workflowId)
      if (status.state !== "changed") return status
      return {
        ...status,
        boundConfigurationNames: configurationNamesBinding(
          db,
          input.workflowId,
          status.diff.removed
        ),
      }
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Takes the source file's changes, as long as they are still the ones that were shown. */
  applyUpdate: publicProcedure
    .input(z.object({ workflowId, contentHash: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      try {
        return applySourceUpdate(requireProject(ctx), input.workflowId, input.contentHash)
      } catch (error) {
        asClientError(error)
      }
    }),
})
