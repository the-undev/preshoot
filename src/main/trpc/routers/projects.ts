import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { ProjectError } from "../../core/projects/errors"
import {
  createProject,
  openProject,
  type OpenProject,
  type ProjectSummary,
} from "../../core/projects/project"
import type { Context } from "../context"
import { publicProcedure, router } from "../trpc"

/** Drops the database handle so the project can cross to the renderer. */
function summarise(project: OpenProject): ProjectSummary {
  return { directory: project.directory, name: project.name, createdAt: project.createdAt }
}

/** Makes `project` the open one and puts it at the front of the recent list. */
function enter(ctx: Context, project: OpenProject): ProjectSummary {
  ctx.projects.replace(project)
  const summary = summarise(project)
  ctx.settings.recordRecentProject(summary)
  return summary
}

/** Rethrows a project folder failure as a message the renderer can show. */
function asClientError(error: unknown): never {
  if (error instanceof ProjectError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error })
  }
  throw error
}

export const projectsRouter = router({
  /** Projects opened before, newest first, excluding any whose folder has gone. */
  recent: publicProcedure.query(({ ctx }) => ctx.settings.listRecentProjects()),

  /** The open project, or null when the app is on the welcome screen. */
  current: publicProcedure.query(({ ctx }) => {
    const project = ctx.projects.current()
    return project ? summarise(project) : null
  }),

  /** Asks the user for a folder, returning null when they cancel. */
  pickDirectory: publicProcedure
    .input(z.object({ purpose: z.enum(["create", "open"]) }))
    .mutation(({ ctx, input }) =>
      input.purpose === "create"
        ? ctx.dialogs.pickDirectory({ title: "Folder for the new project", allowCreate: true })
        : ctx.dialogs.pickDirectory({ title: "Open project", allowCreate: false })
    ),

  /** Turns a folder into a project and opens it. */
  create: publicProcedure
    .input(z.object({ directory: z.string().min(1), name: z.string().trim().min(1) }))
    .mutation(({ ctx, input }) => {
      try {
        const project = createProject({
          directory: input.directory,
          name: input.name,
          migrationsFolder: ctx.migrationsFolder,
        })
        return enter(ctx, project)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Opens an existing project folder. */
  open: publicProcedure
    .input(z.object({ directory: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      try {
        const project = openProject({
          directory: input.directory,
          migrationsFolder: ctx.migrationsFolder,
        })
        return enter(ctx, project)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Closes the open project and returns the app to the welcome screen. */
  close: publicProcedure.mutation(({ ctx }) => {
    ctx.projects.close()
  }),
})
