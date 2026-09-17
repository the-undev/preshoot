import { useState } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@renderer/design-system"

interface PastePromptDialogProps {
  onPaste: (text: string) => void
  onCancel: () => void
}

/**
 * Takes a prompt written anywhere and opens it as a clip. Nothing about the format is required:
 * whatever cannot be read as a shot, a subject or a line of dialogue stays as the words it came
 * in as, so the worst a paste does is give you the text back in shots to work on.
 */
export function PastePromptDialog({
  onPaste,
  onCancel,
}: PastePromptDialogProps): React.JSX.Element {
  const [text, setText] = useState("")
  const typed = text.trim()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (typed.length > 0) onPaste(typed)
          }}
        >
          <DialogHeader>
            <DialogTitle>Open a prompt as a clip</DialogTitle>
            <DialogDescription>
              Paste a prompt from anywhere. What it says about shots, cut times, speakers and
              dialogue is read back where it can be; the rest stays as lines you can work on.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            autoFocus
            aria-label="The prompt to open"
            className="max-h-[50vh] min-h-48 font-mono text-xs"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={typed.length === 0}>
              Open it
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
