import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Settings } from "lucide-react"
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@renderer/design-system"
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
        <div className="flex min-w-0 flex-col">
          <h1 className="font-heading text-lg font-semibold">{project.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{project.directory}</p>
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

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">The clip editor arrives next.</p>
      </main>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
