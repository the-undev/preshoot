import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renderer/design-system"
import { NewProjectDialog } from "@renderer/features/projects/new-project-dialog"
import { RecentProjectsList } from "@renderer/features/projects/recent-projects-list"
import { useOpenProject } from "@renderer/features/projects/use-open-project"
import { useTRPC } from "@renderer/lib/trpc"

export const Route = createFileRoute("/")({
  component: WelcomePage,
})

function WelcomePage(): React.JSX.Element {
  const trpc = useTRPC()
  const info = useQuery(trpc.system.info.queryOptions())
  const recent = useQuery(trpc.projects.recent.queryOptions())
  const openProject = useOpenProject()
  const pickDirectory = useMutation(trpc.projects.pickDirectory.mutationOptions())

  const [newProjectDirectory, setNewProjectDirectory] = useState<string | null>(null)
  const [isDraggingFolder, setIsDraggingFolder] = useState(false)

  const failure = pickDirectory.error ?? openProject.error
  const isBusy = pickDirectory.isPending || openProject.isPending

  function startNewProject(): void {
    pickDirectory.mutate(
      { purpose: "create" },
      {
        onSuccess: (directory) => {
          if (directory) setNewProjectDirectory(directory)
        },
      }
    )
  }

  function startOpenProject(): void {
    pickDirectory.mutate(
      { purpose: "open" },
      {
        onSuccess: (directory) => {
          if (directory) openProject.open(directory)
        },
      }
    )
  }

  function dropFolder(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault()
    setIsDraggingFolder(false)
    const dropped = event.dataTransfer.files[0]
    if (!dropped) return
    openProject.open(window.preshoot.getPathForFile(dropped))
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-8"
      onDragOver={(event) => {
        event.preventDefault()
        setIsDraggingFolder(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDraggingFolder(false)
        }
      }}
      onDrop={dropFolder}
    >
      <div className="flex w-full max-w-[900px] flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-semibold">preshoot</h1>
          <p className="text-sm text-muted-foreground">
            Storyboards and generation prompts. Open a project folder to start.
          </p>
        </header>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={startNewProject} disabled={isBusy}>
                New project
              </Button>
              <Button size="lg" variant="outline" onClick={startOpenProject} disabled={isBusy}>
                Open project
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Or drop a project folder anywhere on this window.
            </p>
            {failure && (
              <Alert variant="destructive">
                <AlertDescription>{failure.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent projects</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.isPending ? (
              <p className="text-sm text-muted-foreground">Reading the recent list.</p>
            ) : (
              <RecentProjectsList projects={recent.data ?? []} onOpen={openProject.open} />
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {info.isPending && "Connecting to main process"}
          {info.isError && `Main process unreachable: ${info.error.message}`}
          {info.isSuccess &&
            `app ${info.data.app} · electron ${info.data.electron} · node ${info.data.node}`}
        </p>
      </div>

      {isDraggingFolder && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center border-4 border-dashed border-primary/60 bg-background/70">
          <p className="text-lg font-medium">Drop a project folder to open it</p>
        </div>
      )}

      {newProjectDirectory && (
        <NewProjectDialog
          key={newProjectDirectory}
          directory={newProjectDirectory}
          onCancel={() => setNewProjectDirectory(null)}
        />
      )}
    </main>
  )
}
