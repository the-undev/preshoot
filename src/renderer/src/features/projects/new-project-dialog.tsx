import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  Alert,
  AlertAction,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@renderer/design-system"
import { useTRPC } from "@renderer/lib/trpc"
import { folderName } from "./folder-name"
import { joinPath } from "./join-path"

interface NewProjectDialogProps {
  directory: string
  onCancel: () => void
}

/** Names the project about to be created, and says where it will go. */
export function NewProjectDialog({
  directory,
  onCancel,
}: NewProjectDialogProps): React.JSX.Element {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(folderName(directory))
  const [createDirectory, setCreateDirectory] = useState(false)

  const create = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.projects.pathKey() })
        await navigate({ to: "/project" })
      },
    })
  )

  const trimmedName = name.trim()
  const projectDirectory = createDirectory ? joinPath(directory, trimmedName) : directory
  // Main refuses a folder holding anything else, and the refusal is the offer to go ahead anyway.
  const needsConfirmation = create.error?.data?.code === "CONFLICT"

  function submit(allowNonEmpty: boolean): void {
    create.mutate({ directory, name: trimmedName, createDirectory, allowNonEmpty })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>{directory}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-project-name">Project name</Label>
            <Input
              id="new-project-name"
              autoFocus
              value={name}
              onChange={(event) => {
                create.reset()
                setName(event.target.value)
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="new-project-create-directory"
              checked={createDirectory}
              onCheckedChange={(checked) => {
                create.reset()
                setCreateDirectory(checked === true)
              }}
            />
            <Label htmlFor="new-project-create-directory">
              Create a directory for this project
            </Label>
          </div>

          <p className="text-xs text-muted-foreground">
            Project folder: <span className="text-foreground">{projectDirectory}</span>
          </p>

          {create.error && (
            <Alert variant={needsConfirmation ? "default" : "destructive"}>
              <AlertDescription>
                {needsConfirmation
                  ? `${create.error.message}. Create the project here anyway?`
                  : create.error.message}
              </AlertDescription>
              {needsConfirmation && (
                <AlertAction>
                  <Button type="button" size="sm" onClick={() => submit(true)}>
                    Create anyway
                  </Button>
                </AlertAction>
              )}
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmedName.length === 0 || create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
