import { projectsRouter } from "./routers/projects"
import { promptsRouter } from "./routers/prompts"
import { settingsRouter } from "./routers/settings"
import { systemRouter } from "./routers/system"
import { router } from "./trpc"

export const appRouter = router({
  system: systemRouter,
  projects: projectsRouter,
  prompts: promptsRouter,
  settings: settingsRouter,
})

export type AppRouter = typeof appRouter
