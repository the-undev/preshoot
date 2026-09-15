import { assetsRouter } from "./routers/assets"
import { clipsRouter } from "./routers/clips"
import { projectsRouter } from "./routers/projects"
import { promptsRouter } from "./routers/prompts"
import { settingsRouter } from "./routers/settings"
import { tabsRouter } from "./routers/tabs"
import { systemRouter } from "./routers/system"
import { router } from "./trpc"

export const appRouter = router({
  system: systemRouter,
  projects: projectsRouter,
  assets: assetsRouter,
  clips: clipsRouter,
  tabs: tabsRouter,
  prompts: promptsRouter,
  settings: settingsRouter,
})

export type AppRouter = typeof appRouter
