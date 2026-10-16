import { statSync } from "node:fs"
import { isAbsolute } from "node:path"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  countVerdicts,
  exportGoodOutputs,
  setOutputNote,
  setOutputVerdict,
} from "../../core/dispatch/review"
import { VERDICTS } from "../../core/dispatch/run-store"
import { asClientError } from "../client-errors"
import { requireOpenProject, requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

/** The longest note an output takes. */
const NOTE_LIMIT = 2000

const outputId = z.number().int()
const workflowId = z.number().int()

export const reviewRouter = router({
  /** Marks an output good or bad, or clears its verdict when given nothing. */
  setVerdict: publicProcedure
    .input(z.object({ outputId, verdict: z.enum(VERDICTS).nullable() }))
    .mutation(({ ctx, input }) => {
      try {
        return setOutputVerdict(requireProject(ctx), input.outputId, input.verdict)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Saves the note on an output. */
  setNote: publicProcedure
    .input(z.object({ outputId, note: z.string().max(NOTE_LIMIT) }))
    .mutation(({ ctx, input }) => {
      try {
        return setOutputNote(requireProject(ctx), input.outputId, input.note)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** How many of a workflow's outputs are good, bad, unmarked, and in all. */
  counts: publicProcedure
    .input(z.object({ workflowId }))
    .query(({ ctx, input }) => countVerdicts(requireProject(ctx), input.workflowId)),

  /**
   * Asks for a folder and copies every good output of a workflow into it. Nothing is asked when
   * no output is marked good.
   */
  exportGood: publicProcedure.input(z.object({ workflowId })).mutation(async ({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    if (countVerdicts(project.db, input.workflowId).good === 0) {
      return { state: "nothing" as const }
    }
    const folder = await ctx.dialogs.pickDirectory({
      title: "Choose a folder for the good outputs",
      allowCreate: true,
    })
    if (folder === null) return { state: "cancelled" as const }
    try {
      const result = exportGoodOutputs({
        db: project.db,
        projectDirectory: project.directory,
        workflowId: input.workflowId,
        destination: folder,
      })
      return result.state === "nothing" ? result : { ...result, folder }
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Opens the folder an export wrote to. Anything but a folder is refused, so no file is run. */
  openExportFolder: publicProcedure
    .input(z.object({ folder: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isFolder(input.folder)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${input.folder} is not a folder.` })
      }
      await ctx.openPath(input.folder)
    }),
})

/** Whether `path` is a full path to a folder that is there. */
function isFolder(path: string): boolean {
  if (!isAbsolute(path)) return false
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
