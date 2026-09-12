import { TRPCError } from "@trpc/server"
import type { OpenProject } from "../core/projects/project"
import type { ProjectDatabase } from "../core/db"
import type { Context } from "./context"

/** The open project, or a refusal the renderer can show. */
export function requireOpenProject(ctx: Context): OpenProject {
  const project = ctx.projects.current()
  if (!project) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Open a project first.",
    })
  }
  return project
}

/** The open project's database, for everything that needs nothing else from it. */
export function requireProject(ctx: Context): ProjectDatabase {
  return requireOpenProject(ctx).db
}
