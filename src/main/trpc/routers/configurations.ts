import { z } from "zod"
import {
  deleteConfiguration,
  duplicateConfiguration,
  listConfigurations,
  loadConfiguration,
  renameConfiguration,
  saveConfiguration,
  updateConfiguration,
} from "../../core/configurations/store"
import { asClientError } from "../client-errors"
import { requireOpenProject, requireProject } from "../project"
import { publicProcedure, router } from "../trpc"
import { bindingSchema } from "./runs"

const configurationId = z.number().int()
const name = z.string().trim().min(1, "Give the configuration a name.")
const bindings = z.array(bindingSchema)

export const configurationsRouter = router({
  /** A workflow's configurations by name, each naming the slots it binds that have gone. */
  list: publicProcedure
    .input(z.object({ workflowId: z.number().int() }))
    .query(({ ctx, input }) => {
      try {
        return listConfigurations(requireProject(ctx), input.workflowId)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Saves the run form's values as a new configuration, copying its files into the project. */
  save: publicProcedure
    .input(z.object({ workflowId: z.number().int(), name, bindings }))
    .mutation(({ ctx, input }) => {
      const project = requireOpenProject(ctx)
      try {
        return saveConfiguration({
          db: project.db,
          directory: project.directory,
          ...input,
          now: new Date(),
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Replaces a configuration's values with the run form's. */
  update: publicProcedure
    .input(z.object({ configurationId, bindings }))
    .mutation(({ ctx, input }) => {
      const project = requireOpenProject(ctx)
      try {
        return updateConfiguration({
          db: project.db,
          directory: project.directory,
          ...input,
          now: new Date(),
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /** A configuration's values for the slots the workflow still has, ready for the run form. */
  load: publicProcedure.input(z.object({ configurationId })).query(({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    try {
      return loadConfiguration(project.db, project.directory, input.configurationId)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Gives a configuration a new name. */
  rename: publicProcedure.input(z.object({ configurationId, name })).mutation(({ ctx, input }) => {
    try {
      return renameConfiguration(requireProject(ctx), input.configurationId, input.name, new Date())
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Copies a configuration, files and all. */
  duplicate: publicProcedure.input(z.object({ configurationId })).mutation(({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    try {
      return duplicateConfiguration({
        db: project.db,
        directory: project.directory,
        configurationId: input.configurationId,
        now: new Date(),
      })
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Deletes a configuration, and the files it copied in that nothing else names. */
  delete: publicProcedure.input(z.object({ configurationId })).mutation(({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    try {
      deleteConfiguration({
        db: project.db,
        directory: project.directory,
        configurationId: input.configurationId,
      })
    } catch (error) {
      asClientError(error)
    }
  }),
})
