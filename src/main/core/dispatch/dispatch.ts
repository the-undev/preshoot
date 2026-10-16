import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { and, eq } from "drizzle-orm"
import type { ComfyUiClient, QueueAnswer } from "../backend/comfyui-client"
import { schema, type ProjectDatabase } from "../db"
import { readGraph } from "../workflows/scan"
import { readWorkflowSlots, type SlotRecord } from "../workflows/store"
import { DispatchError } from "./errors"
import { resolvePrompt, type NodePatch, type SlotValue } from "./resolve"
import {
  completeRun,
  isFinished,
  markFailed,
  markUnfinished,
  readRun,
  recordRun,
  type RecordedBinding,
  type RunRecord,
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

/** The most runs one batch queues. */
export const BATCH_LIMIT = 20

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

/** The value each slot's node holds as saved, so a form can start from the workflow as it is. */
export function savedSlotValues(
  db: ProjectDatabase,
  workflowId: number
): { slotId: number; value: SlotValue | null }[] {
  const stored = storedGraph(db, workflowId)
  const graph = readGraph(stored.sourcePath, stored.graph)
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  return readWorkflowSlots(db, workflowId).map((slot) => {
    const saved = nodes.get(slot.nodeId)?.widgets_values
    const value = VALUE_KINDS.has(slot.kind) && Array.isArray(saved) ? saved[0] : null
    return { slotId: slot.id, value: isSlotValue(value) ? value : null }
  })
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
  const { db, client, workflowId, configurationId, now } = input
  const slots = readWorkflowSlots(db, workflowId)
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const bound = input.bindings.map((binding) => {
    const slot = slotById.get(binding.slotId)
    if (!slot) throw DispatchError.notFound(`Slot ${binding.slotId}`)
    return { slot, binding }
  })

  const objectInfo = await client.objectInfo()
  const recorded: RecordedBinding[] = []
  const patches: NodePatch[] = []
  for (const { slot, binding } of bound) {
    const value = await sentValue(client, binding)
    patches.push({ nodeId: slot.nodeId, on: binding.on, value })
    recorded.push({
      slotId: slot.id,
      slotName: slot.name,
      on: binding.on,
      value,
      file: binding.value?.type === "file" ? binding.value.path : null,
    })
  }
  const prompt = resolvePrompt(storedGraph(db, workflowId).graph, objectInfo, patches, now)

  const answer = await client.queuePrompt(prompt, randomUUID())
  if (!answer.accepted) throw DispatchError.refused(refusalReasons(answer, slots))
  return recordRun(db, {
    workflowId,
    configurationId,
    promptId: answer.promptId,
    apiPrompt: JSON.stringify(prompt),
    bindings: recorded,
    seed: seedOf(slots, recorded, savedSlotValues(db, workflowId)),
    createdAt: now,
  })
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
  const seedSlots = readWorkflowSlots(db, workflowId).filter((slot) => slot.kind === "seed")
  const runs: RunRecord[] = []
  for (let index = 0; index < input.count; index += 1) {
    const bindings =
      index === 0 ? input.bindings : withFreshSeeds(input.bindings, seedSlots, input.randomSeed)
    runs.push(await queueRun({ ...input, bindings }))
  }
  return runs
}

/** A seed JavaScript can hold exactly, which is all but the top bits ComfyUI's seeds allow. */
export function randomSeed(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
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
 * Asks ComfyUI where a run stands and records what it finds. A finished run's files are copied
 * into the project before it is marked done, so a failed copy leaves it to the next poll.
 */
export async function pollRun(input: {
  db: ProjectDatabase
  directory: string
  client: ComfyUiClient
  runId: number
  now: Date
}): Promise<RunStatus> {
  const { db, client, runId, now } = input
  const run = readRun(db, runId)
  if (isFinished(run.state)) return { run, position: null }

  // The queue is read before the history: ComfyUI records a run's history before it leaves the
  // queue, so a run in neither has not just slipped from one to the other.
  const queue = await client.queue()
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
    const name = uniqueName(taken, safeName(file.filename))
    const target = join(input.directory, folder, name)
    // Written aside and moved into place, so a copy cut short never looks like an output.
    writeFileSync(`${target}.part`, await client.view(file))
    renameSync(`${target}.part`, target)
    saved.push({ path: `${folder}/${name}`, sourceFilename: file.filename })
  }
  return { run: completeRun(db, runId, saved, now), position: null }
}

/** The value a binding sends: the value typed, or the name ComfyUI gave a file sent to it. */
async function sentValue(client: ComfyUiClient, binding: SlotBinding): Promise<SlotValue | null> {
  const { value } = binding
  if (value?.type !== "file") return value?.value ?? null
  // A slot that is off feeds nothing, so its file is neither read nor sent.
  if (!binding.on) return null
  let bytes: Buffer
  try {
    bytes = readFileSync(value.path)
  } catch {
    throw DispatchError.unreadableFile(value.path)
  }
  return client.upload(basename(value.path), bytes)
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
  saved: { slotId: number; value: SlotValue | null }[]
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

/** `name`, or `name` with a number before its extension when the run already has one so called. */
function uniqueName(taken: Set<string>, name: string): string {
  const dot = name.lastIndexOf(".")
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
  let candidate = name
  for (let count = 2; taken.has(candidate); count += 1) {
    candidate = `${stem}-${count}${extension}`
  }
  taken.add(candidate)
  return candidate
}

function isSlotValue(value: unknown): value is SlotValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}
