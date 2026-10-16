import { RefreshCw } from "lucide-react"
import { Button } from "@renderer/design-system"
import type { WorkflowFolder, WorkflowSummary } from "@renderer/lib/trpc"

interface WorkflowListProps {
  folder: WorkflowFolder | undefined
  workflows: WorkflowSummary[]
  selectedId: number | null
  isImporting: boolean
  onOpen: (workflowId: number) => void
  onImport: (path: string) => void
  onRefresh: () => void
  onOpenSettings: () => void
}

/** The workflows the project holds, and the files in the workflows folder that can be imported. */
export function WorkflowList({
  folder,
  workflows,
  selectedId,
  isImporting,
  onOpen,
  onImport,
  onRefresh,
  onOpenSettings,
}: WorkflowListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">
          In this project
        </h2>
        {workflows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Import one from the workflows folder and its inputs are mapped here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {workflows.map((workflow) => (
              <li key={workflow.id}>
                <Button
                  variant={workflow.id === selectedId ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start px-3 py-1.5 text-left"
                  aria-current={workflow.id === selectedId ? "page" : undefined}
                  onClick={() => onOpen(workflow.id)}
                >
                  <span className="truncate text-sm">{workflow.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">
            In the workflows folder
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Read the workflows folder again"
            onClick={onRefresh}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
        <FolderFiles
          folder={folder}
          isImporting={isImporting}
          onOpen={onOpen}
          onImport={onImport}
          onOpenSettings={onOpenSettings}
        />
      </section>
    </div>
  )
}

interface FolderFilesProps {
  folder: WorkflowFolder | undefined
  isImporting: boolean
  onOpen: (workflowId: number) => void
  onImport: (path: string) => void
  onOpenSettings: () => void
}

/** The folder's files, or why there are none to show. */
function FolderFiles({
  folder,
  isImporting,
  onOpen,
  onImport,
  onOpenSettings,
}: FolderFilesProps): React.JSX.Element {
  if (!folder) {
    return <p className="text-sm text-muted-foreground">Reading the folder…</p>
  }
  if (folder.state === "unset") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          No workflows folder is set. Name the folder ComfyUI saves workflows into, in settings, and
          its files are listed here. The app only ever reads it.
        </p>
        <Button variant="outline" size="sm" onClick={onOpenSettings}>
          Open settings
        </Button>
      </div>
    )
  }
  if (folder.state === "missing") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          The workflows folder is not there: <span className="break-all">{folder.folder}</span>
        </p>
        <Button variant="outline" size="sm" onClick={onOpenSettings}>
          Open settings
        </Button>
      </div>
    )
  }
  if (folder.files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No workflow files in <span className="break-all">{folder.folder}</span>.
      </p>
    )
  }
  return (
    <ul className="flex flex-col">
      {folder.files.map((file) => (
        <li key={file.path} className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm">{file.name}</span>
            <span className="truncate text-xs text-muted-foreground">{file.relativePath}</span>
          </span>
          {file.importedWorkflowId === null ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isImporting}
              aria-label={`Import ${file.name}`}
              onClick={() => onImport(file.path)}
            >
              Import
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Open ${file.name}`}
              onClick={() => onOpen(file.importedWorkflowId as number)}
            >
              Imported
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
