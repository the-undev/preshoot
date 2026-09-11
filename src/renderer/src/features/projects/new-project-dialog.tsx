import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  Alert,
  AlertDescription,
  Button,
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

interface NewProjectDialogProps {
  directory: string
  onCancel: () => void
}

/** Names the project that is about to be created in `directory`, then creates and opens it. */
export function NewProjectDialog({
  directory,
  onCancel,
}: NewProjectDialogProps): React.JSX.Element {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(folderName(directory))

  const create = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.projects.pathKey() })
        await navigate({ to: "/project" })
      },
    })
  )

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
            create.mutate({ directory, name })
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
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {create.error && (
            <Alert variant="destructive">
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={name.trim().length === 0 || create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
