import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { and, asc, eq, inArray } from "drizzle-orm"
import type { ComfyUiClient, ObjectInfo, QueueAnswer, QueueState } from "../backend/comfyui-client"
import { schema, type ProjectDatabase } from "../db"
import { freeName } from "../files/free-name"
import { readGraph } from "../workflows/scan"
import { readWorkflowSlots, type SlotRecord } from "../workflows/store"
import { DispatchError } from "./errors"
import { resolvePrompt, type NodePatch, type SlotValue } from "./resolve"
import {
  completeRun,
  markFailed,
  markUnfinished,
  readRun,
  recordRun,
  type RecordedBinding,
  type RunRecord,
  type RunState,
} from "./run-store"

/** What fills a slot: a value typed in, or a file picked from disk that is sent to ComfyUI. */
export type BoundValue = { type: "value"; value: SlotValue } | { type: "file"; path: string }

/** One slot of a run: whether its node runs, and what fills it, or nothing to keep it as saved. */
export interface SlotBinding {
  slotId: number
  on: boolean
  value: BoundValue | null
}

/** A run as a poll found it, with its place in ComfyUI's queue while it waits. */
export interface RunStatus {
  run: RunRecord
  position: number | null
}

/** The states of a run ComfyUI has not finished with. */
const UNFINISHED_STATES: RunState[] = ["queued", "running"]

/** The slot kinds whose node holds one value the form shows and a binding replaces. */
const VALUE_KINDS: ReadonlySet<SlotRecord["kind"]> = new Set([
  "text",
  "integer",
  "number",
  "boolean",
  "image",
  "audio",
  "seed",
])

/** The value one slot's node holds as saved. */
type SavedValue = { slotId: number; value: SlotValue | null }

/** The value each slot's node holds as saved, so a form can start from the workflow as it is. */
export function savedSlotValues(db: ProjectDatabase, workflowId: number): SavedValue[] {
  const stored = storedGraph(db, workflowId)
  return savedValuesOf(readWorkflowSlots(db, workflowId), stored.sourcePath, stored.graph)
}

/**
 * Resolves a workflow with its slots filled, sends any picked files, queues it, and records the
 * run. Slots without a binding run as saved. A refusal names the slots at fault.
 */
export async function queueRun(input: {
  db: ProjectDatabase
  client: ComfyUiClient
  workflowId: number
  configurationId: number | null
  bindings: SlotBinding[]
  now: Date
}): Promise<RunRecord> {
  return queueOne(await openBatch(input), input.bindings)
}

/**
 * Queues `count` runs of a workflow one after another. The first runs with the bindings as given
 * and each one after it with a fresh seed in every seed slot, so a batch tries one set of values
 * over several seeds. Runs queued before a refusal stay queued and recorded.
 */
export async function queueBatch(input: {
  db: ProjectDatabase
  client: ComfyUiClient
  workflowId: number
  configurationId: number | null
  bindings: SlotBinding[]
  count: number
  randomSeed: () => number
  now: Date
}): Promise<RunRecord[]> {
  const { db, workflowId, configurationId } = input
  if (configurationId !== null) requireConfiguration(db, workflowId, configurationId)
  const batch = await openBatch(input)
  const seedSlots = batch.slots.filter((slot) => slot.kind === "seed")
  const runs: RunRecord[] = []
  for (let index = 0; index < input.count; index += 1) {
    const bindings =
      index === 0 ? input.bindings : withFreshSeeds(input.bindings, seedSlots, input.randomSeed)
    runs.push(await queueOne(batch, bindings))
  }
  return runs
}

/** What every run of a batch shares, read once, and the names ComfyUI gave the files sent so far. */
interface Batch {
  db: ProjectDatabase
  client: ComfyUiClient
  workflowId: number
  configurationId: number | null
  now: Date
  slots: SlotRecord[]
  graph: string
  savedValues: SavedValue[]
  objectInfo: ObjectInfo
  /** The name ComfyUI gave each file sent, by its path on disk. */
  uploaded: Map<string, string>
}

/** Reads the workflow and asks ComfyUI for its classes, once for all the runs of a batch. */
async function openBatch(input: {
  db: ProjectDatabase
  client: ComfyUiClient
  workflowId: number
  configurationId: number | null
  now: Date
}): Promise<Batch> {
  const { db, client, workflowId, configurationId, now } = input
  const stored = storedGraph(db, workflowId)
  const slots = readWorkflowSlots(db, workflowId)
  return {
    db,
    client,
    workflowId,
    configurationId,
    now,
    slots,
    graph: stored.graph,
    savedValues: savedValuesOf(slots, stored.sourcePath, stored.graph),
    objectInfo: await client.objectInfo(),
    uploaded: new Map(),
  }
}

/** Queues one run of a batch with `bindings` and records it. */
async function queueOne(batch: Batch, bindings: SlotBinding[]): Promise<RunRecord> {
  const slotById = new Map(batch.slots.map((slot) => [slot.id, slot]))
  const bound = bindings.map((binding) => {
    const slot = slotById.get(binding.slotId)
    if (!slot) throw DispatchError.notFound(`Slot ${binding.slotId}`)
    return { slot, binding }
  })

  const recorded: RecordedBinding[] = []
  const patches: NodePatch[] = []
  for (const { slot, binding } of bound) {
    const value = await sentValue(batch, binding)
    patches.push({ nodeId: slot.nodeId, on: binding.on, value })
    recorded.push({
      slotId: slot.id,
      slotName: slot.name,
      on: binding.on,
      value,
      file: binding.value?.type === "file" ? binding.value.path : null,
    })
  }
  const prompt = resolvePrompt(batch.graph, batch.objectInfo, patches, batch.now)

  const answer = await batch.client.queuePrompt(prompt, randomUUID())
  if (!answer.accepted) throw DispatchError.refused(refusalReasons(answer, batch.slots))
  return recordRun(batch.db, {
    workflowId: batch.workflowId,
    configurationId: batch.configurationId,
    promptId: answer.promptId,
    apiPrompt: JSON.stringify(prompt),
    bindings: recorded,
    seed: seedOf(batch.slots, recorded, batch.savedValues),
    createdAt: batch.now,
  })
}

/** The value each slot's node holds in a stored graph. */
function savedValuesOf(slots: SlotRecord[], sourcePath: string, graphText: string): SavedValue[] {
  const graph = readGraph(sourcePath, graphText)
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  return slots.map((slot) => {
    const saved = nodes.get(slot.nodeId)?.widgets_values
    const value = VALUE_KINDS.has(slot.kind) && Array.isArray(saved) ? saved[0] : null
    return { slotId: slot.id, value: isSlotValue(value) ? value : null }
  })
}

/** `bindings` with each seed slot given a new value, bound as it stands when it was not bound. */
function withFreshSeeds(
  bindings: SlotBinding[],
  seedSlots: SlotRecord[],
  random: () => number
): SlotBinding[] {
  const bySlot = new Map(bindings.map((binding) => [binding.slotId, binding]))
  for (const slot of seedSlots) {
    const on = bySlot.get(slot.id)?.on ?? !slot.bypassed
    bySlot.set(slot.id, { slotId: slot.id, on, value: { type: "value", value: random() } })
  }
  return [...bySlot.values()]
}

/** Refuses a configuration that is not one of the workflow's. */
function requireConfiguration(
  db: ProjectDatabase,
  workflowId: number,
  configurationId: number
): void {
  const row = db
    .select({ id: schema.configurations.id })
    .from(schema.configurations)
    .where(
      and(
        eq(schema.configurations.id, configurationId),
        eq(schema.configurations.workflowId, workflowId)
      )
    )
    .get()
  if (!row) throw DispatchError.notFound(`Configuration ${configurationId}`)
}

/**
 * Asks ComfyUI where each unfinished run of a workflow stands and records what it finds, reading
 * the queue once for all of them. A failed poll of one run does not stop the others; the first
 * failure is thrown once they are done.
 */
export async function pollRuns(input: {
  db: ProjectDatabase
  directory: string
  client: ComfyUiClient
  workflowId: number
  now: Date
}): Promise<RunStatus[]> {
  const { db, client, workflowId } = input
  const runIds = db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(
      and(eq(schema.runs.workflowId, workflowId), inArray(schema.runs.state, UNFINISHED_STATES))
    )
    .orderBy(asc(schema.runs.id))
    .all()
    .map((row) => row.id)
  if (runIds.length === 0) return []

  const queue = await client.queue()
  const statuses: RunStatus[] = []
  const failures: unknown[] = []
  for (const runId of runIds) {
    try {
      statuses.push(await pollRun(input, queue, readRun(db, runId)))
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) throw failures[0]
  return statuses
}

/** The error a cancelled run is marked failed with. */
const CANCELLED = "Cancelled."

/**
 * Cancels a run: takes it off ComfyUI's queue while it waits, or stops it while it runs, then
 * marks it failed. A run in neither place is left for the next poll and refused.
 */
export async function cancelRun(input: {
  db: ProjectDatabase
  client: ComfyUiClient
  runId: number
  now: Date
}): Promise<RunRecord> {
  const { db, client, runId, now } = input
  const run = readRun(db, runId)
  if (!UNFINISHED_STATES.includes(run.state)) throw DispatchError.nothingToCancel(runId)
  const queue = await client.queue()
  if (queue.pending.includes(run.promptId)) {
    await client.deletePending([run.promptId])
  } else if (queue.running.includes(run.promptId)) {
    await client.interrupt()
  } else {
    throw DispatchError.nothingToCancel(runId)
  }
  return markFailed(db, runId, CANCELLED, now)
}

/**
 * Records where one unfinished run stands against the queue as read. A finished run's files are
 * copied into the project before it is marked done, so a failed copy leaves it to the next poll.
 */
async function pollRun(
  input: { db: ProjectDatabase; directory: string; client: ComfyUiClient; now: Date },
  queue: QueueState,
  run: RunRecord
): Promise<RunStatus> {
  const { db, client, now } = input
  const runId = run.id
  // The queue is read before the history: ComfyUI records a run's history before it leaves the
  // queue, so a run in neither has not just slipped from one to the other.
  if (queue.running.includes(run.promptId)) {
    return { run: markUnfinished(db, runId, "running"), position: null }
  }
  const waiting = queue.pending.indexOf(run.promptId)
  if (waiting >= 0) return { run: markUnfinished(db, runId, "queued"), position: waiting + 1 }

  const history = await client.history(run.promptId)
  if (!history) {
    const reason = "ComfyUI has no record of this run. It may have been restarted before it ran."
    return { run: markFailed(db, runId, reason, now), position: null }
  }
  if (history.state === "error") {
    return { run: markFailed(db, runId, history.message, now), position: null }
  }

  const folder = `outputs/run-${runId}`
  mkdirSync(join(input.directory, folder), { recursive: true })
  const taken = new Set<string>()
  const saved: { path: string; sourceFilename: string }[] = []
  for (const file of history.outputs) {
    const name = freeName(safeName(file.filename), (candidate) => {
      if (taken.has(candidate)) return false
      taken.add(candidate)
      return true
    })
    const target = join(input.directory, folder, name)
    // Written aside and moved into place, so a copy cut short never looks like an output.
    writeFileSync(`${target}.part`, await client.view(file))
    renameSync(`${target}.part`, target)
    saved.push({ path: `${folder}/${name}`, sourceFilename: file.filename })
  }
  return { run: completeRun(db, runId, saved, now), position: null }
}

/**
 * The value a binding sends: the value typed, or the name ComfyUI gave a file sent to it. A file
 * is sent once a batch, and not at all when its slot is off.
 */
async function sentValue(batch: Batch, binding: SlotBinding): Promise<SlotValue | null> {
  const { value } = binding
  if (value?.type !== "file") return value?.value ?? null
  if (!binding.on) return null
  const sent = batch.uploaded.get(value.path)
  if (sent !== undefined) return sent
  let bytes: Buffer
  try {
    bytes = readFileSync(value.path)
  } catch {
    throw DispatchError.unreadableFile(value.path)
  }
  const name = await batch.client.upload(basename(value.path), bytes)
  batch.uploaded.set(value.path, name)
  return name
}

/** ComfyUI's reasons, each node's under the name of its slot when it has one. */
function refusalReasons(
  answer: Extract<QueueAnswer, { accepted: false }>,
  slots: SlotRecord[]
): string[] {
  const nodeReasons = answer.nodes.map((node) => {
    const slot = slots.find((candidate) => String(candidate.nodeId) === node.nodeId)
    const where = slot?.name ?? `${node.classType ?? "Node"} (node ${node.nodeId})`
    return `${where}: ${node.messages.join("; ")}.`
  })
  const message = answer.message.length > 0 ? [`${answer.message}.`] : []
  return [...message, ...nodeReasons]
}

/**
 * The seed the run uses: that of the first seed slot whose node runs, bound or as saved. A slot
 * switched off feeds no sampler, so its value is not the run's seed.
 */
function seedOf(
  slots: SlotRecord[],
  recorded: RecordedBinding[],
  saved: SavedValue[]
): number | null {
  for (const slot of slots) {
    if (slot.kind !== "seed") continue
    const binding = recorded.find((entry) => entry.slotId === slot.id)
    if (!(binding?.on ?? !slot.bypassed)) continue
    const value = binding?.value ?? saved.find((entry) => entry.slotId === slot.id)?.value
    return typeof value === "number" ? value : null
  }
  return null
}

/** A workflow's stored graph, with the path of the file it came from for naming it in errors. */
function storedGraph(
  db: ProjectDatabase,
  workflowId: number
): { sourcePath: string; graph: string } {
  const row = db
    .select({ sourcePath: schema.workflows.sourcePath, graph: schema.workflows.graph })
    .from(schema.workflows)
    .where(eq(schema.workflows.id, workflowId))
    .get()
  if (!row) throw DispatchError.notFound(`Workflow ${workflowId}`)
  return row
}

/** A file name from ComfyUI that cannot climb out of the run's folder. */
function safeName(filename: string): string {
  const name = basename(filename)
  return name === "" || name === "." || name === ".." ? "output" : name
}

function isSlotValue(value: unknown): value is SlotValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}
