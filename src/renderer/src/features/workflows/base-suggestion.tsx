import { useState } from "react"
import { Button } from "@renderer/design-system"
import type { BaseSuggestion } from "@renderer/lib/trpc"
import { useCopyMapping } from "./use-workflows"

interface BaseSuggestionLineProps {
  /** The workflow just imported, which the copy writes to. */
  workflowId: number
  suggestion: BaseSuggestion
}

/**
 * Offers to copy the tiers, display names and notes of a workflow that shares slots with one just
 * imported. Copying or dismissing it hides it.
 */
export function BaseSuggestionLine({
  workflowId,
  suggestion,
}: BaseSuggestionLineProps): React.JSX.Element | null {
  const panel = useCopyMapping(workflowId, suggestion.workflowId)
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  return (
    <div className="flex flex-col gap-1 rounded border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm">
          {suggestion.name} maps {suggestion.matchingSlots} of the same slots. Copy its mapping?
        </p>
        <span className="flex shrink-0 gap-1">
          <Button
            size="sm"
            disabled={panel.isCopying}
            onClick={() => panel.copy(() => setHidden(true))}
          >
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setHidden(true)}>
            Dismiss
          </Button>
        </span>
      </div>
      {panel.errorMessage && <p className="text-xs text-destructive">{panel.errorMessage}</p>}
    </div>
  )
}
