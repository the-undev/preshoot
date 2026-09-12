import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { readClip, readComposition } from "../../core/composition/clip-store"
import { buildRequest } from "../../core/composition/request"
import {
  pictureExtension,
  promptFileName,
  writePromptFiles,
  type ExportPicture,
} from "../../core/export/prompt-export"
import { projectImagesPath } from "../../core/composition/image-store"
import type { ClipProse } from "../../core/composition/prose"
import type { ProjectDatabase } from "../../core/db"
import { COMPOSERS, composerById, DEFAULT_COMPOSER_ID } from "../../core/prompting/composers"
import type { ComposedPrompt } from "../../core/prompting/composers/composer"
import { editPrompt } from "../../core/prompting/edit"
import {
  insertGeneration,
  listGenerations,
  listRun,
  listRuns,
  readGeneration,
  setNote,
  setVerdict,
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
import { projectPromptExportsPath } from "../../core/projects/marker"
import { asClientError } from "../client-errors"
import type { Context } from "../context"
import { requireOpenProject, requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

const clipId = z.number().int()
const variantId = z.string().min(1)
const strategySchema = z.enum(["prose", "brief", "edit"])

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
    clipNote: composition.note,
    fields: composed.fields,
    composition,
    request: buildRequest(composition, composed.rendered),
    prose: composed.prose,
    rendered: composed.rendered,
    model: composed.model,
    runId: input.runId,
    promptVariantId: variant.id,
    systemPrompt: variant.systemPrompt,
    verdict: null,
    note: "",
    parentId: null,
    editInstruction: null,
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

/** A failure as the renderer should read it, whatever kind it was. */
function asMessage(error: unknown): string {
  try {
    asClientError(error)
  } catch (client) {
    return client instanceof Error ? client.message : String(client)
  }
  return "Something went wrong."
}

/** The generation to export and what its files should be called. */
function readForExport(
  db: ProjectDatabase,
  generationId: number
): { generation: GenerationRecord; baseName: string } {
  const generation = readGeneration(db, generationId)
  if (!generation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That prompt is not in this project." })
  }
  const clipName = generation.clipId === null ? "prompt" : readClip(db, generation.clipId).name
  return {
    generation,
    baseName: promptFileName({ clipName, createdAt: generation.createdAt }),
  }
}

/** The pictures a stored prompt names, taken from the composition it was written from. */
function picturesOf(generation: GenerationRecord, directory: string): ExportPicture[] {
  return (generation.composition?.frames ?? []).map((frame) => ({
    role: frame.role,
    sourcePath: join(projectImagesPath(directory), frame.fileName),
    extension: pictureExtension(frame.fileName),
  }))
}

/** What is kept beside an exported prompt, so a file can be traced back to what made it. */
function exportMeta(generation: GenerationRecord): Record<string, unknown> {
  return {
    target: generation.target,
    composer: generation.composer,
    request: generation.request,
    promptVariantId: generation.promptVariantId,
    model: generation.model,
    clipNote: generation.clipNote,
    editInstruction: generation.editInstruction,
    verdict: generation.verdict,
    note: generation.note,
    createdAt: generation.createdAt,
  }
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
      const clip = readClip(db, input.clipId)

      for (const pair of input.runs) {
        try {
          await writeClip(ctx, db, {
            clipId: input.clipId,
            composerId: pair.composerId,
            variantId: pair.variantId ?? defaultVariantId(clip.target, pair.composerId),
            runId,
            scope: { kind: "all" },
          })
        } catch (error) {
          // What already landed is kept, and the run says where it stopped rather than vanishing.
          return {
            runId,
            results: listRun(db, runId),
            failure: { ...pair, message: asMessage(error) },
          }
        }
      }

      return { runId, results: listRun(db, runId), failure: null }
    }),

  /** Rewrites a prompt with one change made, keeping what it came from. */
  edit: publicProcedure
    .input(
      z.object({
        generationId: z.number().int(),
        instruction: z.string().trim().min(1),
        variantId: variantId.nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        const previous = readGeneration(db, input.generationId)
        if (!previous) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That prompt is not in this project." })
        }
        const model = ctx.settings.llamaModel()
        if (model.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a model in settings before editing a prompt.",
          })
        }

        const target = targetById(previous.target)
        const variant = readVariant(
          db,
          target,
          input.variantId ?? builtinVariantId(previous.target, "edit")
        )
        if (!previous.composition) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This prompt kept no clip, so it cannot be edited.",
          })
        }

        const edited = await editPrompt({
          target,
          composition: previous.composition,
          client: ctx.promptClient(ctx.settings.llamaServerUrl()),
          model,
          systemPrompt: variant.systemPrompt,
          previous: previous.fields,
          instruction: input.instruction,
        })

        return insertGeneration(db, {
          target: previous.target,
          composer: "edit",
          clipId: previous.clipId,
          clipNote: previous.clipNote,
          fields: edited.fields,
          composition: previous.composition,
          request: buildRequest(previous.composition, edited.rendered),
          prose: null,
          rendered: edited.rendered,
          model: edited.model,
          runId: previous.runId,
          promptVariantId: variant.id,
          systemPrompt: variant.systemPrompt,
          verdict: null,
          note: "",
          parentId: previous.id,
          editInstruction: input.instruction,
        })
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

  /** Writes the prompt into the project, where everything exported lives. */
  exportToProject: publicProcedure
    .input(z.object({ generationId: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const project = ctx.projects.current()
      if (!project) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Open a project first." })
      }
      const { generation, baseName } = readForExport(project.db, input.generationId)
      return writePromptFiles({
        directory: projectPromptExportsPath(project.directory),
        baseName,
        rendered: generation.rendered,
        meta: exportMeta(generation),
        pictures: picturesOf(generation, project.directory),
      })
    }),

  /** Asks where to put the prompt, and does nothing when the dialog is cancelled. */
  exportToFile: publicProcedure
    .input(z.object({ generationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const project = requireOpenProject(ctx)
      const { generation, baseName } = readForExport(project.db, input.generationId)
      const chosen = await ctx.dialogs.saveFile({
        title: "Save prompt",
        defaultPath: `${baseName}.txt`,
      })
      if (!chosen) {
        return null
      }
      return writePromptFiles({
        directory: dirname(chosen),
        baseName: basename(chosen).replace(/\.txt$/i, ""),
        rendered: generation.rendered,
        meta: exportMeta(generation),
        pictures: picturesOf(generation, project.directory),
      })
    }),

  /** Opens the folder exported prompts go to, making it first so there is something to open. */
  openExports: publicProcedure.mutation(async ({ ctx }) => {
    const project = ctx.projects.current()
    if (!project) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Open a project first." })
    }
    const directory = projectPromptExportsPath(project.directory)
    mkdirSync(directory, { recursive: true })
    await ctx.openPath(directory)
    return { directory }
  }),

  /** Marks a result good or bad, leaving its note alone. */
  setVerdict: publicProcedure
    .input(
      z.object({
        generationId: z.number().int(),
        verdict: z.enum(["good", "bad"]).nullable(),
      })
    )
    .mutation(({ ctx, input }) => {
      try {
        return setVerdict(requireProject(ctx), { id: input.generationId, verdict: input.verdict })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Keeps a note against a result, leaving its verdict alone. */
  setNote: publicProcedure
    .input(z.object({ generationId: z.number().int(), note: z.string() }))
    .mutation(({ ctx, input }) => {
      try {
        return setNote(requireProject(ctx), { id: input.generationId, note: input.note })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** The comparison runs of one clip, newest first. */
  runs: publicProcedure
    .input(z.object({ clipId }))
    .query(({ ctx, input }) => listRuns(requireProject(ctx), input.clipId)),

  /** Everything one comparison run wrote, in the order it was written. */
  run: publicProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(({ ctx, input }) => listRun(requireProject(ctx), input.runId)),

  /** What has been generated for one clip, newest first. */
  list: publicProcedure
    .input(z.object({ clipId }))
    .query(({ ctx, input }) => listGenerations(requireProject(ctx), input.clipId)),
})
