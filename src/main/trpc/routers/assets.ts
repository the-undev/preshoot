import { z } from "zod"
import {
  ASSET_KINDS,
  deleteAsset,
  insertAsset,
  listAssets,
  updateAsset,
} from "../../core/composition/asset-store"
import { asClientError } from "../client-errors"
import { requireOpenProject, requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

const name = z.string().trim().min(1)
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
