/** What one slot is sent: text typed in, a number, or a file on disk. */
export type SentValue =
  | { type: "text"; text: string }
  | { type: "number"; value: number }
  | { type: "file"; path: string }

/** One piece of a clip and the slot it goes to. */
export interface SentSlotValue {
  slotId: number
  value: SentValue
}

/** A clip's pieces on their way to slots of one workflow, held until the workflow opens. */
export interface ClipTransfer {
  workflowId: number
  /** The clip the pieces came from, which has no name until it is saved. */
  clipName: string | null
  values: SentSlotValue[]
}

let pending: ClipTransfer | null = null

/** Holds a clip's pieces for the workflow it names, in place of any still waiting. */
export function setClipTransfer(transfer: ClipTransfer): void {
  pending = transfer
}

/** The pieces waiting for this workflow, which are no longer held once taken. */
export function takeClipTransfer(workflowId: number): ClipTransfer | null {
  if (pending?.workflowId !== workflowId) return null
  const taken = pending
  pending = null
  return taken
}
