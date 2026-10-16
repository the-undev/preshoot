import { useState } from "react"
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

interface SaveConfigurationDialogProps {
  /** The configuration loaded into the form, which can be updated instead of saved anew. */
  configurationName: string | null
  onSaveNew: (name: string) => Promise<void>
  onUpdate: () => Promise<void>
  onCancel: () => void
}

/** Asks for a name to save the form's values under, or offers to update the loaded configuration. */
export function SaveConfigurationDialog({
  configurationName,
  onSaveNew,
  onUpdate,
  onCancel,
}: SaveConfigurationDialogProps): React.JSX.Element {
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const attempt = async (save: () => Promise<void>): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      await save()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPending(false)
    }
  }
  const canSaveNew = name.trim().length > 0 && !pending

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as configuration</DialogTitle>
          <DialogDescription>
            {configurationName === null
              ? "The form's values are saved under a name, with any chosen files copied into the project."
              : `Update ${configurationName} with the form's values, or save them under a new name.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSaveNew) void attempt(() => onSaveNew(name.trim()))
          }}
        >
          <Label htmlFor="configuration-name">Name</Label>
          <Input
            id="configuration-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {error && <p className="text-sm break-words text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {configurationName !== null && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void attempt(onUpdate)}
              >
                Update {configurationName}
              </Button>
            )}
            <Button type="submit" disabled={!canSaveNew}>
              {configurationName === null ? "Save" : "Save as new"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
