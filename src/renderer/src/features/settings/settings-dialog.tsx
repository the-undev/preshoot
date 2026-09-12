import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@renderer/design-system"
import { useTRPC } from "@renderer/lib/trpc"
import { SettingsForm } from "./settings-form"

interface SettingsDialogProps {
  onClose: () => void
}

/** App settings: where llama-server is, which model it is asked for, and what it is holding. */
export function SettingsDialog({ onClose }: SettingsDialogProps): React.JSX.Element {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const settings = useQuery(trpc.settings.get.queryOptions())
  // Asked for as the dialog opens: an empty list beside a Check button reads as a server with
  // nothing on it, rather than a question nobody has asked yet.
  const saved = useQuery(trpc.settings.models.queryOptions())

  const check = useMutation(trpc.settings.checkLlamaServer.mutationOptions())
  // What unload answers with is newer than what the last check saw, so it wins below.
  const unload = useMutation(trpc.settings.unloadModel.mutationOptions())
  const save = useMutation(
    trpc.settings.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.settings.pathKey() })
        onClose()
      },
    })
  )

  const models = unload.data?.models ?? check.data?.models ?? saved.data?.models ?? []

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>App settings</DialogTitle>
          <DialogDescription>
            Where the app writes prompts, and which model it asks for. These apply to every project.
          </DialogDescription>
        </DialogHeader>
        {settings.data ? (
          <SettingsForm
            llamaServerUrl={settings.data.llamaServerUrl}
            llamaModel={settings.data.llamaModel}
            models={models}
            checkState={check.data?.state ?? saved.data?.state ?? null}
            isChecking={check.isPending || saved.isLoading}
            isSaving={save.isPending}
            isUnloading={unload.isPending}
            errorMessage={
              save.error?.message ?? check.error?.message ?? unload.error?.message ?? null
            }
            onCheck={(url) => check.mutate({ url })}
            onUnload={(modelId) => unload.mutate({ url: settings.data.llamaServerUrl, modelId })}
            onSave={(fields) => save.mutate(fields)}
            onCancel={onClose}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
