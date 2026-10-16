import { useQueries, useQuery } from "@tanstack/react-query"
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/design-system"
import { useTRPC, type WorkflowDetail, type WorkflowSlot } from "@renderer/lib/trpc"
import { setPromptTransfer } from "./prompt-transfer"
import { shownName } from "./slot-labels"

/** A workflow and the text slots its form shows, in the order they are offered. */
interface SendTarget {
  workflow: WorkflowDetail
  slots: WorkflowSlot[]
}

/** Whether a slot is the prompt-sized box shown up front, which is offered first. */
function isPromptBox(slot: WorkflowSlot): boolean {
  return slot.multiline && slot.tier === "basic"
}

/**
 * The workflows a prompt can be sent to, each with its shown text slots, prompt-sized basic ones
 * first and then the rest in graph order.
 */
function sendTargets(workflows: WorkflowDetail[]): SendTarget[] {
  return workflows.flatMap((workflow) => {
    const text = workflow.slots.filter((slot) => slot.kind === "text" && slot.tier !== "hidden")
    const slots = [...text.filter(isPromptBox), ...text.filter((slot) => !isPromptBox(slot))]
    return slots.length === 0 ? [] : [{ workflow, slots }]
  })
}

interface SendPromptDialogProps {
  /** The prompt's full text, which fills the slot picked. */
  text: string
  /** The clip the prompt came from, which has no name until it is saved. */
  clipName: string | null
  onOpenWorkflow: (workflowId: number) => void
  onOpenWorkflows: () => void
  onCancel: () => void
}

/**
 * Lists the project's workflows with a text slot, and opens the one picked with the prompt in the
 * slot picked, unsaved and unqueued.
 */
export function SendPromptDialog({
  text,
  clipName,
  onOpenWorkflow,
  onOpenWorkflows,
  onCancel,
}: SendPromptDialogProps): React.JSX.Element {
  const trpc = useTRPC()
  const list = useQuery(trpc.workflows.list.queryOptions())
  const details = useQueries({
    queries: (list.data ?? []).map((workflow) =>
      trpc.workflows.get.queryOptions({ workflowId: workflow.id })
    ),
  })
  const isReading = list.isPending || details.some((detail) => detail.isPending)
  const errorMessage =
    list.error?.message ?? details.find((detail) => detail.error)?.error?.message ?? null
  const targets = sendTargets(details.flatMap((detail) => (detail.data ? [detail.data] : [])))

  const send = (workflowId: number, slotId: number): void => {
    setPromptTransfer({ workflowId, slotId, text, clipName })
    onOpenWorkflow(workflowId)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to workflow</DialogTitle>
          <DialogDescription>
            The workflow opens with the prompt in the slot picked, to edit, save or queue there.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">{errorMessage}</AlertDescription>
          </Alert>
        )}

        {isReading ? (
          <p className="text-sm text-muted-foreground">Reading the workflows…</p>
        ) : targets.length > 0 ? (
          <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {targets.map((target) => (
              <TargetRow
                key={target.workflow.id}
                target={target}
                onSend={(slotId) => send(target.workflow.id, slotId)}
              />
            ))}
          </ul>
        ) : (
          !errorMessage && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                {list.data?.length === 0
                  ? "This project has no workflows yet. Import one on the Workflows page, and its text slots are offered here."
                  : "None of this project's workflows has a text slot in its form. A slot set to hidden in a workflow's mapping is not offered."}
              </p>
              <Button variant="outline" size="sm" onClick={onOpenWorkflows}>
                Open Workflows
              </Button>
            </div>
          )
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One workflow: the row itself when it has one text slot, or else a choice of its slots. */
function TargetRow({
  target,
  onSend,
}: {
  target: SendTarget
  onSend: (slotId: number) => void
}): React.JSX.Element {
  const { workflow, slots } = target
  if (slots.length === 1) {
    return (
      <li aria-label={workflow.name}>
        <Button
          variant="ghost"
          className="h-auto w-full justify-start gap-2 py-2"
          onClick={() => onSend(slots[0].id)}
        >
          <span className="truncate">{workflow.name}</span>
          <span className="truncate text-xs text-muted-foreground">{shownName(slots[0])}</span>
        </Button>
      </li>
    )
  }
  return (
    <li aria-label={workflow.name} className="flex flex-col gap-0.5 py-1">
      <p className="truncate px-3 text-sm font-medium">{workflow.name}</p>
      <ul className="flex flex-col">
        {slots.map((slot) => (
          <li key={slot.id}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start pl-6"
              onClick={() => onSend(slot.id)}
            >
              <span className="truncate">{shownName(slot)}</span>
            </Button>
          </li>
        ))}
      </ul>
    </li>
  )
}
