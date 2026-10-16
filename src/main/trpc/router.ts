import { assetsRouter } from "./routers/assets"
import { clipsRouter } from "./routers/clips"
import { configurationsRouter } from "./routers/configurations"
import { libraryRouter } from "./routers/library"
import { projectsRouter } from "./routers/projects"
import { promptsRouter } from "./routers/prompts"
import { runsRouter } from "./routers/runs"
import { settingsRouter } from "./routers/settings"
import { tabsRouter } from "./routers/tabs"
import { systemRouter } from "./routers/system"
import { workflowsRouter } from "./routers/workflows"
import { router } from "./trpc"

export const appRouter = router({
  system: systemRouter,
  projects: projectsRouter,
  assets: assetsRouter,
  clips: clipsRouter,
  tabs: tabsRouter,
  prompts: promptsRouter,
  settings: settingsRouter,
  workflows: workflowsRouter,
  runs: runsRouter,
  configurations: configurationsRouter,
  library: libraryRouter,
})

export type AppRouter = typeof appRouter
