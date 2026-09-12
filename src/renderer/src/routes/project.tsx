import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Settings } from "lucide-react"
import {
  Alert,
  AlertDescription,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/design-system"
import { BriefForm } from "@renderer/features/prompts/brief-form"
import { GenerationHistory } from "@renderer/features/prompts/generation-history"
import { PromptResult } from "@renderer/features/prompts/prompt-result"
import { useGeneratePrompt } from "@renderer/features/prompts/use-generate-prompt"
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

  const generations = useQuery(trpc.prompts.list.queryOptions())
  const generate = useGeneratePrompt()

  const close = useMutation(
    trpc.projects.close.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.projects.pathKey() })
        await navigate({ to: "/" })
      },
    })
  )

  const [latest, ...earlier] = generations.data ?? []

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

      <main className="mx-auto grid w-full max-w-[1400px] gap-8 p-8 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <BriefForm onGenerate={generate.generate} isPending={generate.isPending} />
          {generate.errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{generate.errorMessage}</AlertDescription>
            </Alert>
          )}
          {latest && <PromptResult generation={latest} />}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">History</h2>
          <GenerationHistory generations={earlier} />
        </section>
      </main>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
