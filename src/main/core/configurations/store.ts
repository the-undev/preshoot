import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs"
import { basename, join, relative, sep } from "node:path"
import { asc, eq } from "drizzle-orm"
import { schema, type ProjectDatabase, type ProjectDb } from "../db"
import type { BoundValue, SlotBinding } from "../dispatch/dispatch"
import type { RecordedBinding } from "../dispatch/run-store"
import { slotKey, type StoredSlotKey } from "../workflows/diff"
import { isInsideFolder } from "../workflows/folder"
import { readWorkflow, type SlotRecord } from "../workflows/store"
import { ConfigurationError } from "./errors"

/** The folder under the project that holds the files configurations bind. */
const INPUTS_FOLDER = "inputs"

/**
 * How a configuration fills one slot. The slot is named by its node, which outlives the slot's
 * id, and a file is a path under the project folder with forward slashes.
 */
export interface StoredBinding {
  nodeId: number
  nodeType: string
  slotName: string
  on: boolean
  value: BoundValue | null
}

/** A configuration as the list shows it, with its times as ISO strings. */
export interface ConfigurationSummary {
  id: number
  workflowId: number
  name: string
  /** The names of slots it binds that the workflow no longer has. */
  staleSlotNames: string[]
  createdAt: string
  updatedAt: string
}

/** A configuration's bindings matched to the workflow's slots as they are now. */
export interface LoadedConfiguration {
  configuration: ConfigurationSummary
  bindings: SlotBinding[]
}

type ConfigurationRow = typeof schema.configurations.$inferSelect

/** A workflow's configurations, by name. */
export function listConfigurations(db: ProjectDb, workflowId: number): ConfigurationSummary[] {
  const slots = readWorkflow(db, workflowId).slots
  return db
    .select()
    .from(schema.configurations)
    .where(eq(schema.configurations.workflowId, workflowId))
    .orderBy(asc(schema.configurations.name), asc(schema.configurations.id))
    .all()
    .map((row) => toSummary(row, slots))
}

/** The names of a workflow's configurations that bind any of `slots`, in name order. */
export function configurationNamesBinding(
  db: ProjectDb,
  workflowId: number,
  slots: StoredSlotKey[]
): string[] {
  const keys = new Set(slots.map(slotKey))
  return db
    .select()
    .from(schema.configurations)
    .where(eq(schema.configurations.workflowId, workflowId))
    .orderBy(asc(schema.configurations.name), asc(schema.configurations.id))
    .all()
    .filter((row) => bindingsOf(row).some((binding) => keys.has(slotKey(binding))))
    .map((row) => row.name)
}

/** Saves the form's bindings as a new configuration, copying each bound file into the project. */
export function saveConfiguration(input: {
  db: ProjectDatabase
  directory: string
  workflowId: number
  name: string
  bindings: SlotBinding[]
  now: Date
}): ConfigurationSummary {
  const { db, directory, workflowId, now } = input
  const slots = readWorkflow(db, workflowId).slots
  const bindings = storeBindings(directory, slots, input.bindings)
  const row = db
    .insert(schema.configurations)
    .values({ workflowId, name: input.name, bindings, createdAt: now, updatedAt: now })
    .returning()
    .get()
  return toSummary(row, slots)
}

/** Replaces a configuration's bindings, and removes the files it bound that nothing else names. */
export function updateConfiguration(input: {
  db: ProjectDatabase
  directory: string
  configurationId: number
  bindings: SlotBinding[]
  now: Date
}): ConfigurationSummary {
  const { db, directory, configurationId, now } = input
  const before = readRow(db, configurationId)
  const slots = readWorkflow(db, before.workflowId).slots
  const bindings = storeBindings(directory, slots, input.bindings)
  const row = db
    .update(schema.configurations)
    .set({ bindings, updatedAt: now })
    .where(eq(schema.configurations.id, configurationId))
    .returning()
    .get()
  removeUnnamedFiles(db, directory, filesOf(bindingsOf(before)))
  return toSummary(row as ConfigurationRow, slots)
}

/** Gives a configuration a new name. */
export function renameConfiguration(
  db: ProjectDatabase,
  configurationId: number,
  name: string,
  now: Date
): ConfigurationSummary {
  const row = db
    .update(schema.configurations)
    .set({ name, updatedAt: now })
    .where(eq(schema.configurations.id, configurationId))
    .returning()
    .get()
  if (!row) throw ConfigurationError.notFound(`Configuration ${configurationId}`)
  return toSummary(row, readWorkflow(db, row.workflowId).slots)
}

/** Copies a configuration under a new name, with copies of its files so neither shares them. */
export function duplicateConfiguration(input: {
  db: ProjectDatabase
  directory: string
  configurationId: number
  now: Date
}): ConfigurationSummary {
  const { db, directory, now } = input
  const source = readRow(db, input.configurationId)
  const copied: string[] = []
  const bindings = withCleanup(directory, copied, () =>
    bindingsOf(source).map((binding) => {
      if (binding.value?.type !== "file") return binding
      const path = copyIn(directory, join(directory, binding.value.path))
      copied.push(path)
      return { ...binding, value: { type: "file" as const, path } }
    })
  )
  const row = db
    .insert(schema.configurations)
    .values({
      workflowId: source.workflowId,
      name: `${source.name} copy`,
      bindings,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
  return toSummary(row, readWorkflow(db, row.workflowId).slots)
}

/**
 * Deletes a configuration. Runs queued from it keep their bindings and lose the link, and its
 * files go unless another configuration or a run names them.
 */
export function deleteConfiguration(input: {
  db: ProjectDatabase
  directory: string
  configurationId: number
}): void {
  const { db, directory, configurationId } = input
  const row = readRow(db, configurationId)
  db.transaction((tx) => {
    tx.update(schema.runs)
      .set({ configurationId: null })
      .where(eq(schema.runs.configurationId, configurationId))
      .run()
    tx.delete(schema.configurations).where(eq(schema.configurations.id, configurationId)).run()
  })
  removeUnnamedFiles(db, directory, filesOf(bindingsOf(row)))
}

/**
 * A configuration's bindings for the slots the workflow still has, matched by node id and node
 * type, with each file as a path the run form can send.
 */
export function loadConfiguration(
  db: ProjectDb,
  directory: string,
  configurationId: number
): LoadedConfiguration {
  const row = readRow(db, configurationId)
  const slots = readWorkflow(db, row.workflowId).slots
  const slotByKey = new Map(slots.map((slot) => [slotKey(slot), slot]))
  const bindings = bindingsOf(row).flatMap((binding): SlotBinding[] => {
    const slot = slotByKey.get(slotKey(binding))
    if (!slot) return []
    const value: BoundValue | null =
      binding.value?.type === "file"
        ? { type: "file", path: join(directory, binding.value.path) }
        : binding.value
    return [{ slotId: slot.id, on: binding.on, value }]
  })
  return { configuration: toSummary(row, slots), bindings }
}

/**
 * The form's bindings as a configuration keeps them. A file already in the project's inputs
 * folder is named where it is, and any other is copied in.
 */
function storeBindings(
  directory: string,
  slots: SlotRecord[],
  bindings: SlotBinding[]
): StoredBinding[] {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const copied: string[] = []
  return withCleanup(directory, copied, () =>
    bindings.map((binding) => {
      const slot = slotById.get(binding.slotId)
      if (!slot) throw ConfigurationError.notFound(`Slot ${binding.slotId}`)
      const stored = { nodeId: slot.nodeId, nodeType: slot.nodeType, slotName: slot.name }
      if (binding.value?.type !== "file") return { ...stored, on: binding.on, value: binding.value }
      const alreadyIn = isInsideFolder(join(directory, INPUTS_FOLDER), binding.value.path)
      const path = alreadyIn
        ? projectPath(directory, binding.value.path)
        : copyIn(directory, binding.value.path)
      if (!alreadyIn) copied.push(path)
      return { ...stored, on: binding.on, value: { type: "file" as const, path } }
    })
  )
}

/** Runs `build`, and removes the files it copied in when it fails part-way. */
function withCleanup<T>(directory: string, copied: string[], build: () => T): T {
  try {
    return build()
  } catch (error) {
    for (const path of copied) rmSync(join(directory, path), { force: true })
    throw error
  }
}

/** Copies a file into the inputs folder under a name not yet taken, and gives its project path. */
function copyIn(directory: string, sourcePath: string): string {
  const folder = join(directory, INPUTS_FOLDER)
  mkdirSync(folder, { recursive: true })
  const name = freeName(folder, basename(sourcePath))
  const target = join(folder, name)
  // Written aside and moved into place, so a copy cut short is never bound.
  try {
    copyFileSync(sourcePath, `${target}.part`)
  } catch {
    rmSync(`${target}.part`, { force: true })
    throw ConfigurationError.unreadableFile(sourcePath)
  }
  renameSync(`${target}.part`, target)
  return `${INPUTS_FOLDER}/${name}`
}

/** `name`, or `name` with a number before its extension when the folder already holds it. */
function freeName(folder: string, name: string): string {
  const dot = name.lastIndexOf(".")
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
  let candidate = name
  for (let count = 2; existsSync(join(folder, candidate)); count += 1) {
    candidate = `${stem}-${count}${extension}`
  }
  return candidate
}

/** Removes each of `paths` that no configuration and no run names any more. */
function removeUnnamedFiles(db: ProjectDb, directory: string, paths: string[]): void {
  if (paths.length === 0) return
  const named = new Set<string>()
  for (const row of db.select().from(schema.configurations).all()) {
    for (const path of filesOf(bindingsOf(row))) named.add(path)
  }
  const runs = db.select({ bindings: schema.runs.bindings }).from(schema.runs).all()
  for (const run of runs) {
    for (const binding of run.bindings as RecordedBinding[]) {
      if (binding.file && isInsideFolder(directory, binding.file)) {
        named.add(projectPath(directory, binding.file))
      }
    }
  }
  for (const path of paths) {
    if (!named.has(path)) rmSync(join(directory, path), { force: true })
  }
}

/** Where a file under the project folder sits, with forward slashes. */
function projectPath(directory: string, path: string): string {
  return relative(directory, path).split(sep).join("/")
}

function filesOf(bindings: StoredBinding[]): string[] {
  return bindings.flatMap((binding) => (binding.value?.type === "file" ? [binding.value.path] : []))
}

function readRow(db: ProjectDb, configurationId: number): ConfigurationRow {
  const row = db
    .select()
    .from(schema.configurations)
    .where(eq(schema.configurations.id, configurationId))
    .get()
  if (!row) throw ConfigurationError.notFound(`Configuration ${configurationId}`)
  return row
}

function bindingsOf(row: ConfigurationRow): StoredBinding[] {
  return row.bindings as StoredBinding[]
}

function toSummary(row: ConfigurationRow, slots: SlotRecord[]): ConfigurationSummary {
  const keys = new Set(slots.map(slotKey))
  return {
    id: row.id,
    workflowId: row.workflowId,
    name: row.name,
    staleSlotNames: bindingsOf(row)
      .filter((binding) => !keys.has(slotKey(binding)))
      .map((binding) => binding.slotName),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
