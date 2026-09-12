import { useState } from "react"
import { Button, Input, Label, Textarea } from "@renderer/design-system"
import type { PromptVariant } from "@renderer/lib/trpc"
import type { VariantFields } from "./use-variants"

interface VariantFormProps {
  variant: PromptVariant
  isSaving: boolean
  onSubmit: (fields: VariantFields) => void
  onCancel: () => void
}

/** Writes a system prompt. A built-in one arrives here as the starting text of a copy. */
export function VariantForm({
  variant,
  isSaving,
  onSubmit,
  onCancel,
}: VariantFormProps): React.JSX.Element {
  const [name, setName] = useState(variant.editable ? variant.name : `${variant.name} copy`)
  const [systemPrompt, setSystemPrompt] = useState(variant.systemPrompt)

  const trimmedName = name.trim()
  const trimmedPrompt = systemPrompt.trim()
  const ready = trimmedName.length > 0 && trimmedPrompt.length > 0

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) {
          onSubmit({
            strategy: variant.strategy,
            name: trimmedName,
            systemPrompt: trimmedPrompt,
          })
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="variant-name">Name</Label>
        <Input id="variant-name" value={name} onChange={(event) => setName(event.target.value)} />
        <p className="text-xs text-muted-foreground">
          Writes the {variant.strategy === "prose" ? "prose of each shot" : "whole prompt"}.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="variant-prompt">System prompt</Label>
        <Textarea
          id="variant-prompt"
          rows={18}
          className="font-mono text-xs"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || isSaving}>
          Save
        </Button>
      </div>
    </form>
  )
}
