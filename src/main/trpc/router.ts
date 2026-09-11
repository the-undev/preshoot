import { projectsRouter } from "./routers/projects"
import { systemRouter } from "./routers/system"
import { router } from "./trpc"

export const appRouter = router({
  system: systemRouter,
  projects: projectsRouter,
})

export type AppRouter = typeof appRouter
