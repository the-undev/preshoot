import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { readClip, readComposition } from "../../core/composition/clip-store"
import type { ClipProse } from "../../core/composition/prose"
import type { ProjectDatabase } from "../../core/db"
import { COMPOSERS, composerById, DEFAULT_COMPOSER_ID } from "../../core/prompting/composers"
import type { ComposedPrompt } from "../../core/prompting/composers/composer"
import {
  insertGeneration,
  listGenerations,
  readGeneration,
  type GenerationRecord,
} from "../../core/prompting/generation-store"
import type { ComposeScope } from "../../core/prompting/target"
import { targetById } from "../../core/prompting/targets"
import { asClientError } from "../client-errors"
import type { Context } from "../context"
import { requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

/** Writes one clip and keeps what came back. */
async function writeClip(
  ctx: Context,
  db: ProjectDatabase,
  input: { clipId: number; composerId: string; scope: ComposeScope }
): Promise<GenerationRecord> {
  const clip = readClip(db, input.clipId)
  const composition = readComposition(db, input.clipId)
  const composer = composerById(input.composerId)

  const composed: ComposedPrompt = await composer.compose({
    composition,
    model: ctx.settings.llamaModel(),
    target: targetById(clip.target),
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
    runId: null,
    promptVariantId: null,
    systemPrompt: null,
    verdict: null,
    note: "",
  })
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

  /** Writes a whole clip and stores the result. */
  generate: publicProcedure
    .input(z.object({ clipId: z.number().int(), composerId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        return await writeClip(ctx, db, { ...input, scope: { kind: "all" } })
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
        const scope: ComposeScope = {
          kind: "shot",
          shotId: input.shotId,
          previous: proseToKeep(
            previous,
            input.shotId,
            composition.shots.map((shot) => shot.id)
          ),
        }
        return await writeClip(ctx, db, {
          clipId: previous.clipId,
          composerId: previous.composer,
          scope,
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** What has been generated for one clip, newest first. */
  list: publicProcedure
    .input(z.object({ clipId: z.number().int() }))
    .query(({ ctx, input }) => listGenerations(requireProject(ctx), input.clipId)),
})
