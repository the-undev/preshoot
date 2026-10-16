import { eq } from "drizzle-orm"
import { schema, type ProjectDatabase } from "../db"
import { listWorkflows, readWorkflow, readWorkflowSlots, type WorkflowDetail } from "./store"

/** The least share of slots two workflows agree on for one to be offered as the other's base. */
export const MIN_BASE_SCORE = 0.5

/** The fewest slots two workflows agree on for one to be offered as the other's base. */
export const MIN_BASE_MATCHES = 3

/** What a slot is matched by across two workflows: its node type and its scanned name. */
export interface SlotIdentity {
  nodeType: string
  name: string
}

/** How far two workflows' slots agree: the slots that pair up, and their share of the larger. */
export interface BaseScore {
  matches: number
  score: number
}

/** A workflow already in the project whose mapping a new one could start from. */
export interface BaseSuggestion {
  workflowId: number
  name: string
  matchingSlots: number
}

/** A workflow weighed as a base, with its slots. */
export interface BaseCandidate {
  id: number
  name: string
  slots: SlotIdentity[]
}

/**
 * Pairs the slots of two workflows that agree on node type and scanned name, each slot in one pair
 * at most, taking repeats in the order given.
 */
export function matchSlots<A extends SlotIdentity, B extends SlotIdentity>(
  slots: A[],
  others: B[]
): [A, B][] {
  const waiting = new Map<string, B[]>()
  for (const other of others) {
    const key = identityOf(other)
    waiting.set(key, [...(waiting.get(key) ?? []), other])
  }
  return slots.flatMap((slot): [A, B][] => {
    const other = waiting.get(identityOf(slot))?.shift()
    return other ? [[slot, other]] : []
  })
}

/** Scores two workflows' slots: the pairs `matchSlots` finds, over the slot count of the larger. */
export function scoreBase(slots: SlotIdentity[], others: SlotIdentity[]): BaseScore {
  const matches = matchSlots(slots, others).length
  return { matches, score: matches / Math.max(slots.length, others.length, 1) }
}

/**
 * The candidate whose slots agree most with `slots`, as long as it passes both thresholds. A tie
 * goes to the earlier candidate.
 */
export function pickBase(
  slots: SlotIdentity[],
  candidates: BaseCandidate[]
): BaseSuggestion | null {
  let best: { candidate: BaseCandidate; score: BaseScore } | null = null
  for (const candidate of candidates) {
    const score = scoreBase(slots, candidate.slots)
    if (score.score < MIN_BASE_SCORE || score.matches < MIN_BASE_MATCHES) continue
    if (best && score.score <= best.score.score) continue
    best = { candidate, score }
  }
  if (!best) return null
  return {
    workflowId: best.candidate.id,
    name: best.candidate.name,
    matchingSlots: best.score.matches,
  }
}

/** The project's other workflow to offer as a base for `workflowId`, or null when none fits. */
export function suggestBase(db: ProjectDatabase, workflowId: number): BaseSuggestion | null {
  const slots = readWorkflowSlots(db, workflowId)
  const candidates = listWorkflows(db)
    .filter((workflow) => workflow.id !== workflowId)
    .map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      slots: readWorkflowSlots(db, workflow.id),
    }))
  return pickBase(slots, candidates)
}

/**
 * Copies the tier, display name and note of each slot of `fromWorkflowId` onto the slot of
 * `workflowId` it pairs with, all at once or not at all. A slot with no pair is left as it is.
 */
export function copyMapping(
  db: ProjectDatabase,
  input: { workflowId: number; fromWorkflowId: number }
): WorkflowDetail {
  return db.transaction((tx) => {
    const pairs = matchSlots(
      readWorkflowSlots(tx, input.workflowId),
      readWorkflowSlots(tx, input.fromWorkflowId)
    )
    for (const [slot, from] of pairs) {
      tx.update(schema.workflowSlots)
        .set({ tier: from.tier, displayName: from.displayName, note: from.note })
        .where(eq(schema.workflowSlots.id, slot.id))
        .run()
    }
    return readWorkflow(tx, input.workflowId)
  })
}

function identityOf(slot: SlotIdentity): string {
  return `${slot.nodeType}\u0000${slot.name}`
}
