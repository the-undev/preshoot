import type { ScannedSlot } from "./scan"

/** The parts of a stored slot a re-scan is matched against. */
export interface StoredSlotKey {
  id: number
  nodeId: number
  nodeType: string
  name: string
  /** The name the form shows instead of the scanned one, or null. */
  displayName: string | null
}

/** A stored slot whose node is still in the graph under a new title. */
export interface RenamedSlot {
  slotId: number
  nodeId: number
  from: string
  to: string
  /** The name the form shows instead, which the rename leaves as it is. */
  displayName: string | null
}

/**
 * How a fresh scan differs from the stored slots. A slot is the same slot when its node id and
 * node type match, and only then: a new node with an old title is an added slot and a removed one.
 */
export interface SlotDiff {
  kept: StoredSlotKey[]
  renamed: RenamedSlot[]
  added: ScannedSlot[]
  removed: StoredSlotKey[]
}

/** Matches a fresh scan against the stored slots by node id and node type. */
export function diffSlots(stored: StoredSlotKey[], scanned: ScannedSlot[]): SlotDiff {
  const scannedByKey = new Map(scanned.map((slot) => [slotKey(slot), slot]))
  const storedKeys = new Set(stored.map(slotKey))
  const diff: SlotDiff = { kept: [], renamed: [], added: [], removed: [] }

  for (const slot of stored) {
    const fresh = scannedByKey.get(slotKey(slot))
    if (!fresh) {
      diff.removed.push(slot)
      continue
    }
    if (fresh.name === slot.name) {
      diff.kept.push(slot)
      continue
    }
    diff.renamed.push({
      slotId: slot.id,
      nodeId: slot.nodeId,
      from: slot.name,
      to: fresh.name,
      displayName: slot.displayName,
    })
  }
  diff.added = scanned.filter((slot) => !storedKeys.has(slotKey(slot)))
  return diff
}

/** Whether the scan changes nothing about the slots. */
export function changesNoSlots(diff: SlotDiff): boolean {
  return diff.renamed.length === 0 && diff.added.length === 0 && diff.removed.length === 0
}

/** What makes two slots the same slot: the node they fill, and its type. */
export function slotKey(slot: { nodeId: number; nodeType: string }): string {
  return `${slot.nodeId}\u0000${slot.nodeType}`
}
