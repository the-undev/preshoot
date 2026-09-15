import { mkdirSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { readClip, readComposition } from "../../core/composition/clip-store"
import {
  pictureExtension,
  promptFileName,
  writePromptFiles,
  type ExportPicture,
} from "../../core/export/prompt-export"
import { projectImagesPath } from "../../core/composition/image-store"
import type { ClipComposition } from "../../core/composition/clip"
import type { ProjectDatabase } from "../../core/db"
import { composeClip } from "../../core/prompting/compose"
import type { ClipPrompt } from "../../core/prompting/compose"
import { DEFAULT_TARGET_ID, TARGETS, targetById } from "../../core/prompting/targets"
import { projectPromptExportsPath } from "../../core/projects/marker"
import { asClientError } from "../client-errors"
import { requireOpenProject } from "../project"
import { publicProcedure, router } from "../trpc"

const clipId = z.number().int()

/** What an export is made of: the prompt as it stands now, and what to call its files. */
interface ClipExport {
  targetId: string
  composition: ClipComposition
  prompt: Extract<ClipPrompt, { ready: true }>
  baseName: string
}

/** The clip's prompt as it stands, or a refusal saying what is still missing from it. */
function readForExport(db: ProjectDatabase, id: number): ClipExport {
  const clip = readClip(db, id)
  const composition = readComposition(db, id)
  const prompt = composeClip(composition, targetById(clip.target))
  if (!prompt.ready) {
    throw new TRPCError({ code: "BAD_REQUEST", message: prompt.reason })
  }
  return {
    targetId: clip.target,
    composition,
    prompt,
    baseName: promptFileName({ clipName: clip.name ?? "", createdAt: new Date().toISOString() }),
  }
}

/** The pictures a prompt names, which have to travel with it. */
function picturesOf(composition: ClipComposition, directory: string): ExportPicture[] {
  return composition.frames.map((frame) => ({
    role: frame.role,
    sourcePath: join(projectImagesPath(directory), frame.fileName),
    extension: pictureExtension(frame.fileName),
  }))
}

/** What is kept beside an exported prompt, so a file can be traced back to the clip that made it. */
function exportMeta(clip: ClipExport): Record<string, unknown> {
  return {
    target: clip.targetId,
    clip: clip.composition.name,
    clipNote: clip.composition.note,
    request: clip.prompt.request,
    exportedAt: new Date().toISOString(),
  }
}

export const promptsRouter = router({
  /** The targets the app can write for, for the clip's own picker. */
  targets: publicProcedure.query(() => ({
    targets: Object.values(TARGETS).map(({ id, name }) => ({ id, name })),
    defaultId: DEFAULT_TARGET_ID,
  })),

  /** Writes the prompt into the project, where everything exported lives. */
  exportToProject: publicProcedure.input(z.object({ clipId })).mutation(({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    try {
      const clip = readForExport(project.db, input.clipId)
      return writePromptFiles({
        directory: projectPromptExportsPath(project.directory),
        baseName: clip.baseName,
        rendered: clip.prompt.rendered,
        meta: exportMeta(clip),
        pictures: picturesOf(clip.composition, project.directory),
      })
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Asks where to put the prompt, and does nothing when the dialog is cancelled. */
  exportToFile: publicProcedure.input(z.object({ clipId })).mutation(async ({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    const clip = readForExport(project.db, input.clipId)
    const chosen = await ctx.dialogs.saveFile({
      title: "Save prompt",
      defaultPath: `${clip.baseName}.txt`,
    })
    if (!chosen) {
      return null
    }
    return writePromptFiles({
      directory: dirname(chosen),
      baseName: basename(chosen).replace(/\.txt$/i, ""),
      rendered: clip.prompt.rendered,
      meta: exportMeta(clip),
      pictures: picturesOf(clip.composition, project.directory),
    })
  }),

  /** Opens the folder exported prompts go to, making it first so there is something to open. */
  openExports: publicProcedure.mutation(async ({ ctx }) => {
    const project = requireOpenProject(ctx)
    const directory = projectPromptExportsPath(project.directory)
    mkdirSync(directory, { recursive: true })
    await ctx.openPath(directory)
    return { directory }
  }),
})
