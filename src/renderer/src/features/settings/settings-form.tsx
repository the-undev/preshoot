import { useState } from "react"
import { Button, Input, Label } from "@renderer/design-system"
import type { ServerModel, ServerReport } from "@renderer/lib/trpc"

/** What the Check button reports about the server it reached. */
const CHECK_MESSAGES: Record<ServerReport["state"], string> = {
  ok: "The server answered.",
  loading: "The server is still loading its model.",
  unreachable: "No answer at that URL.",
}

interface SettingsFormProps {
  llamaServerUrl: string
  llamaModel: string
  models: ServerModel[]
  checkState: ServerReport["state"] | null
  isChecking: boolean
  isSaving: boolean
  isUnloading: boolean
  errorMessage: string | null
  onCheck: (url: string) => void
  onUnload: (modelId: string) => void
  onSave: (fields: { llamaServerUrl: string; llamaModel: string }) => void
  onCancel: () => void
}

/** Where llama-server is, which model it is asked for, and what it is holding. */
export function SettingsForm({
  llamaServerUrl,
  llamaModel,
  models,
  checkState,
  isChecking,
  isSaving,
  isUnloading,
  errorMessage,
  onCheck,
  onUnload,
  onSave,
  onCancel,
}: SettingsFormProps): React.JSX.Element {
  const [url, setUrl] = useState(llamaServerUrl)
  const [model, setModel] = useState(llamaModel)

  // Nothing saved yet means the first model the server offers, so a check is enough to get going.
  const chosen = model.length > 0 ? model : (models[0]?.id ?? "")
  const trimmedUrl = url.trim()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ llamaServerUrl: trimmedUrl, llamaModel: chosen })
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

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving || trimmedUrl.length === 0}>
          Save
        </Button>
      </div>
    </form>
  )
}
