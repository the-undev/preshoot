import { randomUUID } from "node:crypto"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { readClip, readComposition } from "../../core/composition/clip-store"
import type { ClipProse } from "../../core/composition/prose"
import type { ProjectDatabase } from "../../core/db"
import { COMPOSERS, composerById, DEFAULT_COMPOSER_ID } from "../../core/prompting/composers"
import type { ComposedPrompt } from "../../core/prompting/composers/composer"
import {
  insertGeneration,
  judgeGeneration,
  listGenerations,
  listRun,
  readGeneration,
  type GenerationRecord,
} from "../../core/prompting/generation-store"
import type { ComposeScope } from "../../core/prompting/target"
import { DEFAULT_TARGET_ID, TARGETS, targetById } from "../../core/prompting/targets"
import { builtinVariantId, type PromptStrategy } from "../../core/prompting/variant"
import {
  deleteVariant,
  insertVariant,
  listVariants,
  readVariant,
  updateVariant,
} from "../../core/prompting/variant-store"
import { asClientError } from "../client-errors"
import type { Context } from "../context"
import { requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

const clipId = z.number().int()
const variantId = z.string().min(1)
const strategySchema = z.enum(["prose", "brief"])

/** Which kind of system prompt a way of writing needs. */
const COMPOSER_STRATEGY: Record<string, PromptStrategy> = { prose: "prose", brief: "brief" }

/** Writes one clip one way and keeps what came back. */
async function writeClip(
  ctx: Context,
  db: ProjectDatabase,
  input: {
    clipId: number
    composerId: string
    variantId: string
    runId: string | null
    scope: ComposeScope
  }
): Promise<GenerationRecord> {
  const model = ctx.settings.llamaModel()
  const composer = composerById(input.composerId)
  const clip = readClip(db, input.clipId)
  const target = targetById(clip.target)
  const composition = readComposition(db, input.clipId)
  const variant = readVariant(db, target, input.variantId)

  // The assembled way calls no model, so only the others need one chosen.
  if (model.length === 0 && composer.id !== "assembled") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a model in settings before writing a prompt.",
    })
  }

  const composed: ComposedPrompt = await composer.compose({
    composition,
    model,
    systemPrompt: variant.systemPrompt,
    target,
    client: ctx.promptClient(ctx.settings.llamaServerUrl()),
    scope: input.scope,
  })

  return insertGeneration(db, {
    target: clip.target,
    composer: composer.id,
    clipId: clip.id,
    brief: composition.note,
    fields: composed.fields,
    composition,
    prose: composed.prose,
    rendered: composed.rendered,
    model: composed.model,
    runId: input.runId,
    promptVariantId: variant.id,
    systemPrompt: variant.systemPrompt,
    verdict: null,
    note: "",
  })
}

/** The prompt a way of writing falls back to when none was named. */
function defaultVariantId(targetId: string, composerId: string): string {
  return builtinVariantId(targetId, COMPOSER_STRATEGY[composerId] ?? "prose")
}

/** The prose of every shot but `shotId`, or a refusal when the clip has moved on since. */
function proseToKeep(previous: GenerationRecord, shotId: number, shotIds: number[]): ClipProse {
  if (!previous.prose) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Generate the whole clip before rewriting one shot of it.",
    })
  }
  const missing = shotIds
    .filter((id) => id !== shotId)
    .filter((id) => !previous.prose?.shots.some((written) => written.shotId === id))
  if (missing.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This clip has shots the last generation did not cover. Generate the whole clip.",
    })
  }
  return previous.prose
}

export const promptsRouter = router({
  /** Every way of writing a clip, for the picker beside Generate. */
  composers: publicProcedure.query(() => ({
    composers: Object.values(COMPOSERS).map(({ id, name }) => ({ id, name })),
    defaultId: DEFAULT_COMPOSER_ID,
  })),

  /** The targets the app can write for, for the prompts screen and the clip's own picker. */
  targets: publicProcedure.query(() => ({
    targets: Object.values(TARGETS).map(({ id, name }) => ({ id, name })),
    defaultId: DEFAULT_TARGET_ID,
  })),

  /** The system prompts that can write for a target. */
  variants: publicProcedure
    .input(z.object({ targetId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        return listVariants(db, targetById(input.targetId))
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Writes a new system prompt, or rewrites one written here. */
  saveVariant: publicProcedure
    .input(
      z.object({
        id: z.string().nullable(),
        targetId: z.string().min(1),
        strategy: strategySchema,
        name: z.string().trim().min(1),
        systemPrompt: z.string().trim().min(1),
      })
    )
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        return input.id === null
          ? insertVariant(db, {
              targetId: input.targetId,
              strategy: input.strategy,
              name: input.name,
              systemPrompt: input.systemPrompt,
            })
          : updateVariant(db, {
              id: input.id,
              name: input.name,
              systemPrompt: input.systemPrompt,
            })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Removes a system prompt written here. */
  removeVariant: publicProcedure.input(z.object({ id: variantId })).mutation(({ ctx, input }) => {
    try {
      deleteVariant(requireProject(ctx), input.id)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Writes a whole clip and stores the result. */
  generate: publicProcedure
    .input(
      z.object({
        clipId,
        composerId: z.string().min(1),
        variantId: variantId.nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        const clip = readClip(db, input.clipId)
        return await writeClip(ctx, db, {
          clipId: input.clipId,
          composerId: input.composerId,
          variantId: input.variantId ?? defaultVariantId(clip.target, input.composerId),
          runId: null,
          scope: { kind: "all" },
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /**
   * Writes one clip several ways at once and keeps the results under a single run, so they can be
   * read side by side. A pair that fails stops the run and leaves what already landed.
   */
  compare: publicProcedure
    .input(
      z.object({
        clipId,
        runs: z
          .array(z.object({ composerId: z.string().min(1), variantId: variantId.nullable() }))
          .min(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = requireProject(ctx)
      const runId = randomUUID()
      try {
        const clip = readClip(db, input.clipId)
        for (const pair of input.runs) {
          await writeClip(ctx, db, {
            clipId: input.clipId,
            composerId: pair.composerId,
            variantId: pair.variantId ?? defaultVariantId(clip.target, pair.composerId),
            runId,
            scope: { kind: "all" },
          })
        }
        return listRun(db, runId)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Writes one shot again, keeping what the last generation wrote for the others. */
  regenerateShot: publicProcedure
    .input(z.object({ generationId: z.number().int(), shotId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        const previous = readGeneration(db, input.generationId)
        if (!previous?.clipId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This prompt was not written from a clip, so a shot of it cannot be rewritten.",
          })
        }
        const composition = readComposition(db, previous.clipId)
        return await writeClip(ctx, db, {
          clipId: previous.clipId,
          composerId: previous.composer,
          variantId:
            previous.promptVariantId ?? defaultVariantId(previous.target, previous.composer),
          runId: previous.runId,
          scope: {
            kind: "shot",
            shotId: input.shotId,
            previous: proseToKeep(
              previous,
              input.shotId,
              composition.shots.map((shot) => shot.id)
            ),
          },
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Marks a result good or bad and keeps a note against it. */
  judge: publicProcedure
    .input(
      z.object({
        generationId: z.number().int(),
        verdict: z.enum(["good", "bad"]).nullable(),
        note: z.string().trim(),
      })
    )
    .mutation(({ ctx, input }) => {
      try {
        return judgeGeneration(requireProject(ctx), {
          id: input.generationId,
          verdict: input.verdict,
          note: input.note,
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** What has been generated for one clip, newest first. */
  list: publicProcedure
    .input(z.object({ clipId }))
    .query(({ ctx, input }) => listGenerations(requireProject(ctx), input.clipId)),
})
