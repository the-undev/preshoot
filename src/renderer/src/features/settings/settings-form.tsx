import { useState } from "react"
import { Button, Input, Label, Separator } from "@renderer/design-system"
import type { ComfyUiStatus, ServerModel, ServerReport } from "@renderer/lib/trpc"

/** What the Check button reports about the server it reached. */
const CHECK_MESSAGES: Record<ServerReport["state"], string> = {
  ok: "The server answered.",
  loading: "The server is still loading its model.",
  unreachable: "No answer at that URL.",
}

/** What the ComfyUI check found, naming the version when something answered. */
function comfyUiMessage(status: ComfyUiStatus): string {
  if (status.state === "unreachable") {
    return "No answer from ComfyUI at that URL."
  }
  return `ComfyUI ${status.version} answered.`
}

interface SettingsFormProps {
  llamaServerUrl: string
  llamaModel: string
  comfyUiUrl: string
  workflowsFolder: string | null
  libraryFolder: string | null
  models: ServerModel[]
  checkState: ServerReport["state"] | null
  isChecking: boolean
  comfyUiStatus: ComfyUiStatus | null
  isCheckingComfyUi: boolean
  comfyUiErrorMessage: string | null
  isSaving: boolean
  isUnloading: boolean
  errorMessage: string | null
  onCheck: (url: string) => void
  onCheckComfyUi: (url: string) => void
  /** Asks for a folder, answering with the one chosen or nothing when the picker was cancelled. */
  onPickWorkflowsFolder: () => Promise<string | null>
  /** Asks for the library folder, answering the same way as the workflows one. */
  onPickLibraryFolder: () => Promise<string | null>
  onUnload: (modelId: string) => void
  onSave: (fields: {
    llamaServerUrl: string
    llamaModel: string
    comfyUiUrl: string
    workflowsFolder: string | null
    libraryFolder: string | null
  }) => void
  onCancel: () => void
}

/**
 * Where llama-server is, which model it is asked for and what it is holding, where ComfyUI is,
 * which folder workflows are imported from, and which folder holds the library.
 */
export function SettingsForm({
  llamaServerUrl,
  llamaModel,
  comfyUiUrl,
  workflowsFolder,
  libraryFolder,
  models,
  checkState,
  isChecking,
  comfyUiStatus,
  isCheckingComfyUi,
  comfyUiErrorMessage,
  isSaving,
  isUnloading,
  errorMessage,
  onCheck,
  onCheckComfyUi,
  onPickWorkflowsFolder,
  onPickLibraryFolder,
  onUnload,
  onSave,
  onCancel,
}: SettingsFormProps): React.JSX.Element {
  const [url, setUrl] = useState(llamaServerUrl)
  const [model, setModel] = useState(llamaModel)
  const [typedComfyUiUrl, setTypedComfyUiUrl] = useState(comfyUiUrl)
  const [typedWorkflowsFolder, setTypedWorkflowsFolder] = useState(workflowsFolder ?? "")
  const [typedLibraryFolder, setTypedLibraryFolder] = useState(libraryFolder ?? "")

  // Nothing saved yet means the first model the server offers, so a check is enough to get going.
  const chosen = model.length > 0 ? model : (models[0]?.id ?? "")
  const trimmedUrl = url.trim()
  const trimmedComfyUiUrl = typedComfyUiUrl.trim()
  const trimmedWorkflowsFolder = typedWorkflowsFolder.trim()
  const trimmedLibraryFolder = typedLibraryFolder.trim()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({
          llamaServerUrl: trimmedUrl,
          llamaModel: chosen,
          comfyUiUrl: trimmedComfyUiUrl,
          workflowsFolder: trimmedWorkflowsFolder.length > 0 ? trimmedWorkflowsFolder : null,
          libraryFolder: trimmedLibraryFolder.length > 0 ? trimmedLibraryFolder : null,
        })
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="llama-server-url">llama-server URL</Label>
        <div className="flex gap-2">
          <Input
            id="llama-server-url"
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={isChecking}
            aria-label="Check llama-server"
            onClick={() => onCheck(trimmedUrl)}
          >
            {isChecking ? "Checking…" : "Check"}
          </Button>
        </div>
        {checkState && (
          <p className="text-xs text-muted-foreground">{CHECK_MESSAGES[checkState]}</p>
        )}
        {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Model</span>
        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Check the server to see which models it can serve.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {models.map((serverModel) => (
              <li key={serverModel.id} className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={serverModel.id === chosen ? "secondary" : "ghost"}
                  className="h-auto flex-1 justify-start px-3 py-2 text-left"
                  aria-pressed={serverModel.id === chosen}
                  onClick={() => setModel(serverModel.id)}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{serverModel.id}</span>
                    <span className="text-xs text-muted-foreground">
                      {serverModel.state}
                      {serverModel.modalities.includes("image") ? " · sees images" : ""}
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={serverModel.state !== "loaded" || isUnloading}
                  aria-label={`Unload ${serverModel.id}`}
                  onClick={() => onUnload(serverModel.id)}
                >
                  Unload
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label htmlFor="comfyui-url">ComfyUI URL</Label>
        <div className="flex gap-2">
          <Input
            id="comfyui-url"
            value={typedComfyUiUrl}
            onChange={(event) => setTypedComfyUiUrl(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={isCheckingComfyUi}
            aria-label="Check ComfyUI"
            onClick={() => onCheckComfyUi(trimmedComfyUiUrl)}
          >
            {isCheckingComfyUi ? "Checking…" : "Check"}
          </Button>
        </div>
        {comfyUiStatus && (
          <p className="text-xs text-muted-foreground">{comfyUiMessage(comfyUiStatus)}</p>
        )}
        {comfyUiErrorMessage && <p className="text-xs text-destructive">{comfyUiErrorMessage}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="workflows-folder">Workflows folder</Label>
        <div className="flex gap-2">
          <Input
            id="workflows-folder"
            value={typedWorkflowsFolder}
            onChange={(event) => setTypedWorkflowsFolder(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            aria-label="Browse for the workflows folder"
            onClick={() => {
              void onPickWorkflowsFolder().then((picked) => {
                if (picked !== null) setTypedWorkflowsFolder(picked)
              })
            }}
          >
            Browse
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Where ComfyUI saves workflows. The app copies from it and never writes to it.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="library-folder">Library folder</Label>
        <div className="flex gap-2">
          <Input
            id="library-folder"
            value={typedLibraryFolder}
            onChange={(event) => setTypedLibraryFolder(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            aria-label="Browse for the library folder"
            onClick={() => {
              void onPickLibraryFolder().then((picked) => {
                if (picked !== null) setTypedLibraryFolder(picked)
              })
            }}
          >
            Browse
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A folder per kind, such as characters or scenes, and a folder per entry inside it. The app
          copies from it, and writes to it only when a subject is copied to the library.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSaving || trimmedUrl.length === 0 || trimmedComfyUiUrl.length === 0}
        >
          Save
        </Button>
      </div>
    </form>
  )
}
