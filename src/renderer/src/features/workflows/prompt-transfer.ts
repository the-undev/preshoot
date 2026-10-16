/** A clip's prompt on its way to one text slot of a workflow, held until the workflow opens. */
export interface PromptTransfer {
  workflowId: number
  slotId: number
  text: string
  /** The clip the prompt came from, which has no name until it is saved. */
  clipName: string | null
}

let pending: PromptTransfer | null = null

/** Holds a prompt for the workflow it names, in place of any still waiting. */
export function setPromptTransfer(transfer: PromptTransfer): void {
  pending = transfer
}

/** The prompt waiting for this workflow, which is no longer held once taken. */
export function takePromptTransfer(workflowId: number): PromptTransfer | null {
  if (pending?.workflowId !== workflowId) return null
  const taken = pending
  pending = null
  return taken
}
