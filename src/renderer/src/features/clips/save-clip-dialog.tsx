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

interface SaveClipDialogProps {
  /** The name it already has, which is nothing the first time a clip is saved. */
  name: string | null
  onSave: (name: string) => void
  onCancel: () => void
}

/** Asks what to call a clip, which is the only place a clip is named. */
export function SaveClipDialog({ name, onSave, onCancel }: SaveClipDialogProps): React.JSX.Element {
  const [typed, setTyped] = useState(name ?? "")
  const trimmed = typed.trim()
  const saving = name === null

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
            if (trimmed.length > 0) onSave(trimmed)
          }}
        >
          <DialogHeader>
            <DialogTitle>{saving ? "Save this clip" : "Rename this clip"}</DialogTitle>
            <DialogDescription>
              {saving
                ? "Saving keeps the clip in the project and lists it in an empty tab, ready to branch from."
                : "The name is what the tab and the list of clips call it."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            <Label htmlFor="save-clip-name">Name</Label>
            <Input
              id="save-clip-name"
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed.length === 0}>
              {saving ? "Save" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
