import { Button } from "@renderer/design-system"
import type { RecentProject } from "@renderer/lib/trpc"

interface RecentProjectsListProps {
  projects: RecentProject[]
  onOpen: (directory: string) => void
}

/** Previously opened projects, newest first. */
export function RecentProjectsList({
  projects,
  onOpen,
}: RecentProjectsListProps): React.JSX.Element {
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">No projects opened yet.</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {projects.map((project) => (
        <li key={project.directory}>
          <Button
            variant="ghost"
            className="h-auto w-full justify-start px-3 py-2 text-left"
            onClick={() => onOpen(project.directory)}
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{project.name}</span>
              <span className="truncate text-xs text-muted-foreground">{project.directory}</span>
            </span>
          </Button>
        </li>
      ))}
    </ul>
  )
}
