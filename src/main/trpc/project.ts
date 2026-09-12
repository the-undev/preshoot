import { TRPCError } from "@trpc/server"
import type { ProjectDatabase } from "../core/db"
import type { Context } from "./context"

/** The open project's database, or a refusal the renderer can show. */
export function requireProject(ctx: Context): ProjectDatabase {
  const project = ctx.projects.current()
  if (!project) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Open a project first.",
    })
  }
  return project.db
}
