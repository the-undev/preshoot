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

  const models = unload.data?.models ?? check.data?.models ?? []

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
          <SettingsForm
            llamaServerUrl={settings.data.llamaServerUrl}
            llamaModel={settings.data.llamaModel}
            models={models}
            checkState={check.data?.state ?? null}
            isChecking={check.isPending}
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
