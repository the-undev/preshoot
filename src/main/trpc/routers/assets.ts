import { readFileSync } from "node:fs"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  ASSET_KINDS,
  deleteAsset,
  insertAsset,
  listAssets,
  updateAsset,
} from "../../core/composition/asset-store"
import {
  deleteImage,
  IMAGE_MEDIA_TYPES,
  importImage,
  listAllImages,
  listImages,
  readImage,
} from "../../core/composition/image-store"
import { describeAsset } from "../../core/vision/describe-asset"
import { asClientError } from "../client-errors"
import { requireOpenProject, requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

const name = z.string().trim().min(1)
const assetId = z.number().int()

/** What the picker offers, taken from what the project can hold. */
const IMAGE_EXTENSIONS = Object.keys(IMAGE_MEDIA_TYPES).map((extension) => extension.slice(1))
const description = z.string().trim().min(1)

export const assetsRouter = router({
  /** The library of this project, by kind then name. */
  list: publicProcedure.query(({ ctx }) => listAssets(requireProject(ctx))),

  /** Adds a person, a place or an object the clips can refer to. */
  create: publicProcedure
    .input(z.object({ kind: z.enum(ASSET_KINDS), name, description }))
    .mutation(({ ctx, input }) => insertAsset(requireProject(ctx), input)),

  /** Renames a thing or rewrites its description. */
  update: publicProcedure
    .input(z.object({ id: z.number().int(), kind: z.enum(ASSET_KINDS), name, description }))
    .mutation(({ ctx, input }) => {
      try {
        return updateAsset(requireProject(ctx), input)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Every picture in the library, so the list can show them without asking one thing at a time. */
  images: publicProcedure.query(({ ctx }) => listAllImages(requireProject(ctx))),

  /** Asks for pictures and copies the chosen ones into the project. */
  addImages: publicProcedure.input(z.object({ assetId })).mutation(async ({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    const chosen = await ctx.dialogs.pickFiles({
      title: "Add reference pictures",
      extensions: IMAGE_EXTENSIONS,
    })
    try {
      return chosen.map((sourcePath) =>
        importImage(project.db, {
          directory: project.directory,
          assetId: input.assetId,
          sourcePath,
        })
      )
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Removes a picture and the file behind it. */
  removeImage: publicProcedure
    .input(z.object({ imageId: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const project = requireOpenProject(ctx)
      try {
        deleteImage(project.db, project.directory, input.imageId)
      } catch (error) {
        asClientError(error)
      }
    }),

  /**
   * Writes a description from a thing's pictures and hands it back without saving it, so it can be
   * read and changed before it becomes the description every prompt leans on.
   */
  draft: publicProcedure.input(z.object({ assetId })).mutation(async ({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    const asset = listAssets(project.db).find((entry) => entry.id === input.assetId)
    if (!asset) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That thing is not in this project." })
    }

    const client = ctx.promptClient(ctx.settings.llamaServerUrl())
    const chosen = ctx.settings.llamaModel()
    try {
      const model = (await client.models()).find((entry) => entry.id === chosen)
      if (!model) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a model in settings before drafting a description.",
        })
      }

      const images = listImages(project.db, input.assetId).map((image) => ({
        mediaType: image.mediaType,
        base64: readFileSync(readImage(project.db, project.directory, image.id).path).toString(
          "base64"
        ),
      }))

      return {
        description: await describeAsset({
          client,
          model,
          kind: asset.kind,
          name: asset.name,
          images,
        }),
      }
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Removes a thing and its pictures, unless a shot still shows it. */
  remove: publicProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    try {
      deleteAsset(project.db, project.directory, input.id)
    } catch (error) {
      asClientError(error)
    }
  }),
})
