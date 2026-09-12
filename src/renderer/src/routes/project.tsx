import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router"
import { Settings } from "lucide-react"
import {
  Button,
  buttonVariants,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/design-system"
import { SettingsDialog } from "@renderer/features/settings/settings-dialog"
import { useTRPC } from "@renderer/lib/trpc"

export const Route = createFileRoute("/project")({
  // Main holds the open project, so the guard asks it rather than trusting the cache.
  beforeLoad: async ({ context }) => {
    const project = await context.queryClient.fetchQuery(
      context.trpc.projects.current.queryOptions()
    )
    if (!project) throw redirect({ to: "/" })
    return { project }
  },
  component: ProjectWorkspace,
})

/** The tab look, since the tabs are links rather than panels. */
const tabClass = buttonVariants({ variant: "ghost", size: "sm" })
const activeTab = { className: "bg-accent text-accent-foreground" }

function ProjectWorkspace(): React.JSX.Element {
  const { project } = Route.useRouteContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const close = useMutation(
    trpc.projects.close.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.projects.pathKey() })
        await navigate({ to: "/" })
      },
    })
  )

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-6 border-b px-6 py-4">
        <div className="flex min-w-0 items-center gap-6">
          <div className="flex min-w-0 flex-col">
            <h1 className="font-heading text-lg font-semibold">{project.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{project.directory}</p>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              to="/project"
              activeOptions={{ exact: true }}
              className={tabClass}
              activeProps={activeTab}
            >
              Clips
            </Link>
            <Link to="/project/library" className={tabClass} activeProps={activeTab}>
              Library
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <Button variant="outline" onClick={() => close.mutate()} disabled={close.isPending}>
            Close
          </Button>
        </div>
      </header>

      <Outlet />

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
