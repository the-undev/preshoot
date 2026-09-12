import { useState } from "react"
import { Button, Label, Textarea } from "@renderer/design-system"

interface BriefFormProps {
  onGenerate: (brief: string) => void
  isPending: boolean
}

/** The brief for one clip, and the button that turns it into a prompt. */
export function BriefForm({ onGenerate, isPending }: BriefFormProps): React.JSX.Element {
  const [brief, setBrief] = useState("")
  const trimmedBrief = brief.trim()

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (trimmedBrief.length > 0) onGenerate(trimmedBrief)
      }}
    >
      <Label htmlFor="brief">Brief</Label>
      <Textarea
        id="brief"
        rows={8}
        value={brief}
        disabled={isPending}
        placeholder="A baker opens the shutters of a small street bakery before sunrise."
        onChange={(event) => setBrief(event.target.value)}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || trimmedBrief.length === 0}>
          {isPending ? "Generating…" : "Generate"}
        </Button>
      </div>
    </form>
  )
}
