import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { basename, extname, resolve } from "node:path"
import { asc, eq } from "drizzle-orm"
import { schema, type ProjectDatabase, type ProjectDb } from "../db"
import { changesNoSlots, diffSlots, slotKey, type SlotDiff } from "./diff"
import { WorkflowError } from "./errors"
import { isInsideFolder } from "./folder"
import {
  readGraph,
  scanGraph,
  type GuideNote,
  type ScannedSlot,
  type SlotKind,
  type SlotTier,
} from "./scan"

/** A workflow in the project, with its times as ISO strings since it crosses to the renderer. */
export interface WorkflowSummary {
  id: number
  name: string
  sourcePath: string
  contentHash: string
  importedAt: string
  updatedAt: string
}

/** One stored slot of a workflow. */
export interface SlotRecord {
  id: number
  workflowId: number
  nodeId: number
  nodeType: string
  name: string
  kind: SlotKind
  tier: SlotTier
  bypassed: boolean
  position: number
}

/** A workflow with its mapping and its guide. */
export interface WorkflowDetail extends WorkflowSummary {
  slots: SlotRecord[]
  guide: GuideNote[]
}

/** How the source file stands against the project's copy. */
export type SourceStatus =
  | { state: "in-sync" }
  | { state: "updated" }
  | { state: "missing" }
  | { state: "unreadable"; message: string }
  | { state: "changed"; contentHash: string; diff: SlotDiff }

type WorkflowRow = typeof schema.workflows.$inferSelect
type SlotRow = typeof schema.workflowSlots.$inferSelect

/** The project's workflows, by name. */
export function listWorkflows(db: ProjectDatabase): WorkflowSummary[] {
  return db
    .select()
    .from(schema.workflows)
    .orderBy(asc(schema.workflows.name), asc(schema.workflows.id))
    .all()
    .map(toSummary)
}

/** One workflow with its slots in graph order and the guide its notes make. */
export function readWorkflow(db: ProjectDb, id: number): WorkflowDetail {
  const row = db.select().from(schema.workflows).where(eq(schema.workflows.id, id)).get()
  if (!row) throw WorkflowError.notFound(`Workflow ${id}`)

  const slots = db
    .select()
    .from(schema.workflowSlots)
    .where(eq(schema.workflowSlots.workflowId, id))
    .orderBy(asc(schema.workflowSlots.position))
    .all()
    .map(toSlotRecord)
  const { guide } = scanGraph(readGraph(row.sourcePath, row.graph))
  return { ...toSummary(row), slots, guide }
}

/**
 * Copies a workflow file from the workflows folder into the project and stores what its scan
 * found. The file is read and never written.
 */
export function importWorkflow(
  db: ProjectDatabase,
  input: { folder: string; sourcePath: string }
): WorkflowDetail {
  const sourcePath = resolve(input.sourcePath)
  if (!isInsideFolder(input.folder, sourcePath)) throw WorkflowError.outsideFolder(sourcePath)
  if (listWorkflows(db).some((workflow) => resolve(workflow.sourcePath) === sourcePath)) {
    throw WorkflowError.alreadyImported(sourcePath)
  }

  const source = readSource(sourcePath)
  if (!source) throw WorkflowError.unreadable(sourcePath, "it is not there.")
  const { slots } = scanGraph(readGraph(sourcePath, source.text))

  return db.transaction((tx) => {
    const now = new Date()
    const workflow = tx
      .insert(schema.workflows)
      .values({
        name: basename(sourcePath, extname(sourcePath)),
        sourcePath,
        graph: source.text,
        contentHash: source.hash,
        importedAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    insertSlots(tx, workflow.id, slots)
    return readWorkflow(tx, workflow.id)
  })
}

/** Moves a slot to another tier of the mapping. */
export function setSlotTier(db: ProjectDatabase, slotId: number, tier: SlotTier): SlotRecord {
  const row = db
    .update(schema.workflowSlots)
    .set({ tier })
    .where(eq(schema.workflowSlots.id, slotId))
    .returning()
    .get()
  if (!row) throw WorkflowError.notFound(`Slot ${slotId}`)
  return toSlotRecord(row)
}

/**
 * Reads the source file again and says whether, and how, it differs from the project's copy. A
 * change that renames, adds and removes no slot is applied here and reported as `updated`, since
 * there is nothing for the user to decide.
 */
export function checkSource(db: ProjectDatabase, workflowId: number): SourceStatus {
  const workflow = readWorkflow(db, workflowId)
  let source: SourceFile | null
  try {
    source = readSource(workflow.sourcePath)
  } catch (error) {
    return { state: "unreadable", message: error instanceof Error ? error.message : String(error) }
  }
  if (!source) return { state: "missing" }
  if (source.hash === workflow.contentHash) return { state: "in-sync" }

  try {
    const { slots } = scanGraph(readGraph(workflow.sourcePath, source.text))
    const diff = diffSlots(workflow.slots, slots)
    if (!changesNoSlots(diff)) return { state: "changed", contentHash: source.hash, diff }
    applyScan(db, workflowId, source, slots)
    return { state: "updated" }
  } catch (error) {
    if (error instanceof WorkflowError) return { state: "unreadable", message: error.message }
    throw error
  }
}

/**
 * Takes the source file's changes into the project: its graph and hash replace the snapshot, kept
 * slots take their new names and keep their tiers, removed slots go and added slots come in at the
 * tier the scan gives them, all at once or not at all. `contentHash` is the hash the changes were
 * shown for, so a file saved again in between is refused rather than taken unseen.
 */
export function applySourceUpdate(
  db: ProjectDatabase,
  workflowId: number,
  contentHash: string
): WorkflowDetail {
  const workflow = readWorkflow(db, workflowId)
  const source = readSource(workflow.sourcePath)
  if (!source) throw WorkflowError.unreadable(workflow.sourcePath, "it is not there any more.")
  if (source.hash !== contentHash) throw WorkflowError.stale()
  const { slots } = scanGraph(readGraph(workflow.sourcePath, source.text))
  return applyScan(db, workflowId, source, slots)
}

/** Writes a scanned source into the project's copy of a workflow, all at once or not at all. */
function applyScan(
  db: ProjectDatabase,
  workflowId: number,
  source: SourceFile,
  slots: ScannedSlot[]
): WorkflowDetail {
  const freshByKey = new Map(slots.map((slot) => [slotKey(slot), slot]))

  return db.transaction((tx) => {
    const stored = readWorkflow(tx, workflowId).slots
    const diff = diffSlots(stored, slots)
    const removedIds = new Set(diff.removed.map((slot) => slot.id))
    tx.update(schema.workflows)
      .set({ graph: source.text, contentHash: source.hash, updatedAt: new Date() })
      .where(eq(schema.workflows.id, workflowId))
      .run()

    for (const slot of stored) {
      if (removedIds.has(slot.id)) {
        tx.delete(schema.workflowSlots).where(eq(schema.workflowSlots.id, slot.id)).run()
        continue
      }
      // Kept, so the tier stays as the user left it and everything the graph says is taken.
      const fresh = freshByKey.get(slotKey(slot)) as ScannedSlot
      tx.update(schema.workflowSlots)
        .set({
          name: fresh.name,
          kind: fresh.kind,
          bypassed: fresh.bypassed,
          position: fresh.position,
        })
        .where(eq(schema.workflowSlots.id, slot.id))
        .run()
    }
    insertSlots(tx, workflowId, diff.added)
    return readWorkflow(tx, workflowId)
  })
}

/** A source file's text and the hash it is compared by. */
interface SourceFile {
  text: string
  hash: string
}

/** Reads a workflow file, or nothing when it is not there. Any other failure is thrown. */
function readSource(path: string): SourceFile | null {
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  return { text: bytes.toString("utf8"), hash: createHash("sha256").update(bytes).digest("hex") }
}

function insertSlots(tx: ProjectDb, workflowId: number, slots: ScannedSlot[]): void {
  for (const slot of slots) {
    tx.insert(schema.workflowSlots)
      .values({
        workflowId,
        nodeId: slot.nodeId,
        nodeType: slot.nodeType,
        name: slot.name,
        kind: slot.kind,
        tier: slot.tier,
        bypassed: slot.bypassed,
        position: slot.position,
      })
      .run()
  }
}

function toSummary(row: WorkflowRow): WorkflowSummary {
  return {
    id: row.id,
    name: row.name,
    sourcePath: row.sourcePath,
    contentHash: row.contentHash,
    importedAt: row.importedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toSlotRecord(row: SlotRow): SlotRecord {
  return { ...row, kind: row.kind as SlotKind, tier: row.tier as SlotTier }
}
