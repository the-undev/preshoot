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

/**
 * App settings: where llama-server and ComfyUI are, which model llama-server is asked for, and
 * where workflows are imported from.
 */
export function SettingsDialog({ onClose }: SettingsDialogProps): React.JSX.Element {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const settings = useQuery(trpc.settings.get.queryOptions())
  // Asked for as the dialog opens: an empty list beside a Check button reads as a server with
  // nothing on it, rather than a question nobody has asked yet.
  const saved = useQuery(trpc.settings.models.queryOptions())
  const savedComfyUi = useQuery(trpc.settings.comfyUiStatus.queryOptions())

  const check = useMutation(trpc.settings.checkLlamaServer.mutationOptions())
  const checkComfyUi = useMutation(trpc.settings.checkComfyUi.mutationOptions())
  const pickWorkflowsFolder = useMutation(trpc.settings.pickWorkflowsFolder.mutationOptions())
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
            Where llama-server and ComfyUI are, which model the app asks llama-server for, and where
            workflows come from. These apply to every project.
          </DialogDescription>
        </DialogHeader>
        {settings.data ? (
          <SettingsForm
            llamaServerUrl={settings.data.llamaServerUrl}
            llamaModel={settings.data.llamaModel}
            comfyUiUrl={settings.data.comfyUiUrl}
            workflowsFolder={settings.data.workflowsFolder}
            models={models}
            checkState={check.data?.state ?? saved.data?.state ?? null}
            isChecking={check.isPending || saved.isLoading}
            comfyUiStatus={checkComfyUi.data ?? savedComfyUi.data ?? null}
            isCheckingComfyUi={checkComfyUi.isPending || savedComfyUi.isLoading}
            comfyUiErrorMessage={checkComfyUi.error?.message ?? null}
            isSaving={save.isPending}
            isUnloading={unload.isPending}
            errorMessage={
              save.error?.message ?? check.error?.message ?? unload.error?.message ?? null
            }
            onCheck={(url) => check.mutate({ url })}
            onCheckComfyUi={(url) => checkComfyUi.mutate({ url })}
            onPickWorkflowsFolder={() => pickWorkflowsFolder.mutateAsync()}
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
