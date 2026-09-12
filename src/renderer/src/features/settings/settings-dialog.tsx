import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
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

/** What the Check button reports about the server it reached. */
const CHECK_MESSAGES = {
  ok: "The server answered and its model is ready.",
  loading: "The server is still loading its model.",
  unreachable: "No answer at that URL.",
}

interface SettingsDialogProps {
  onClose: () => void
}

/** App settings: where llama-server is, and whether it is answering. */
export function SettingsDialog({ onClose }: SettingsDialogProps): React.JSX.Element {
  const trpc = useTRPC()
  const settings = useQuery(trpc.settings.get.queryOptions())

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Where the app writes prompts.</DialogDescription>
        </DialogHeader>
        {settings.data ? (
          <SettingsForm llamaServerUrl={settings.data.llamaServerUrl} onClose={onClose} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface SettingsFormProps {
  llamaServerUrl: string
  onClose: () => void
}

/** The form proper, seeded once the saved settings have arrived. */
function SettingsForm({ llamaServerUrl, onClose }: SettingsFormProps): React.JSX.Element {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [url, setUrl] = useState(llamaServerUrl)

  const check = useMutation(trpc.settings.checkLlamaServer.mutationOptions())
  const save = useMutation(
    trpc.settings.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.settings.pathKey() })
        onClose()
      },
    })
  )

  const failure = save.error ?? check.error

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate({ llamaServerUrl: url.trim() })
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="llama-server-url">llama-server URL</Label>
        <div className="flex gap-2">
          <Input
            id="llama-server-url"
            autoFocus
            value={url}
            onChange={(event) => {
              check.reset()
              save.reset()
              setUrl(event.target.value)
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={check.isPending}
            onClick={() => check.mutate({ url: url.trim() })}
          >
            {check.isPending ? "Checking…" : "Check"}
          </Button>
        </div>
        {check.data && (
          <p className="text-xs text-muted-foreground">{CHECK_MESSAGES[check.data]}</p>
        )}
        {failure && <p className="text-xs text-destructive">{failure.message}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || url.trim().length === 0}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
