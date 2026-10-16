import { useState } from "react"
import { Button } from "@renderer/design-system"

interface WorkflowRemovalProps {
  name: string
  configurationCount: number
  runCount: number
  isRemoving: boolean
  onRemove: () => void
}

/** Removes a workflow's copy from the project once the removal is confirmed. */
export function WorkflowRemoval({
  name,
  configurationCount,
  runCount,
  isRemoving,
  onRemove,
}: WorkflowRemovalProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
        Remove
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
      <span>
        Remove {name}? Its {counted(configurationCount, "configuration")} and{" "}
        {counted(runCount, "run")} go too, with their output files.
      </span>
      <Button size="sm" variant="destructive" disabled={isRemoving} onClick={onRemove}>
        Remove
      </Button>
      <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </div>
  )
}

/** A count with its noun, made plural unless there is one. */
function counted(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}
