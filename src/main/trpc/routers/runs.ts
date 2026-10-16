import { join } from "node:path"
import { z } from "zod"
import { IMAGE_MEDIA_TYPES } from "../../core/composition/image-store"
import {
  BATCH_LIMIT,
  pollRuns,
  queueBatch,
  randomSeed,
  savedSlotValues,
} from "../../core/dispatch/dispatch"
import { listRuns, readRunOutput } from "../../core/dispatch/run-store"
import { asClientError } from "../client-errors"
import { requireOpenProject, requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

const workflowId = z.number().int()

/** What fills a slot: a value typed in, or a file picked from disk. */
const boundValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("value"), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ type: z.literal("file"), path: z.string().min(1) }),
])

/** One slot as the run form sends it, which a configuration saves as well. */
export const bindingSchema = z.object({
  slotId: z.number().int(),
  on: z.boolean(),
  value: boundValueSchema.nullable(),
})

/** The kinds of slot filled from a file. */
const FILE_KINDS = ["image", "audio"] as const

/** The files each kind of file slot offers in its picker. */
const PICKERS: Record<
  (typeof FILE_KINDS)[number],
  { title: string; filterName: string; extensions: string[] }
> = {
  image: {
    title: "Choose a picture",
    filterName: "Pictures",
    extensions: Object.keys(IMAGE_MEDIA_TYPES).map((extension) => extension.slice(1)),
  },
  audio: {
    title: "Choose a sound",
    filterName: "Sound",
    extensions: ["wav", "mp3", "flac", "ogg", "m4a", "opus"],
  },
}

export const runsRouter = router({
  /** The value each slot of a workflow holds as saved, which a form starts from. */
  values: publicProcedure.input(z.object({ workflowId })).query(({ ctx, input }) => {
    try {
      return savedSlotValues(requireProject(ctx), input.workflowId)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** A workflow's runs, newest first. */
  list: publicProcedure
    .input(z.object({ workflowId }))
    .query(({ ctx, input }) => listRuns(requireProject(ctx), input.workflowId)),

  /**
   * Resolves a workflow with its slots filled and queues it on the saved ComfyUI `count` times,
   * every run after the first with fresh seeds, and records each one.
   */
  queue: publicProcedure
    .input(
      z.object({
        workflowId,
        bindings: z.array(bindingSchema),
        configurationId: z.number().int().nullable().default(null),
        count: z.number().int().min(1).max(BATCH_LIMIT).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        return await queueBatch({
          db,
          client: ctx.comfyUiClient(ctx.settings.comfyUiUrl()),
          workflowId: input.workflowId,
          configurationId: input.configurationId,
          bindings: input.bindings,
          count: input.count,
          randomSeed,
          now: new Date(),
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /**
   * Asks ComfyUI where each unfinished run of a workflow stands, records it, and copies a run's
   * outputs in once it is done.
   */
  poll: publicProcedure.input(z.object({ workflowId })).mutation(async ({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    try {
      return await pollRuns({
        db: project.db,
        directory: project.directory,
        client: ctx.comfyUiClient(ctx.settings.comfyUiUrl()),
        workflowId: input.workflowId,
        now: new Date(),
      })
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Asks for a file to fill an image or audio slot, and hands its path back. */
  pickFile: publicProcedure
    .input(z.object({ kind: z.enum(FILE_KINDS) }))
    .mutation(async ({ ctx, input }) => {
      const [chosen] = await ctx.dialogs.pickFiles({ ...PICKERS[input.kind], multiple: false })
      return chosen ?? null
    }),

  /** Opens one of a run's outputs in the app the system gives its kind of file. */
  openOutput: publicProcedure
    .input(z.object({ outputId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const project = requireOpenProject(ctx)
      try {
        const output = readRunOutput(project.db, input.outputId)
        await ctx.openPath(join(project.directory, output.path))
      } catch (error) {
        asClientError(error)
      }
    }),
})
