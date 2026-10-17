import { z } from "zod"
import type { ObjectInfo } from "../backend/comfyui-client"
import { NOTE_NODE_TYPES } from "../workflows/scan"
import { DispatchError } from "./errors"
import { fillFilenamePrefix } from "./filename-prefix"

/** A link in ComfyUI's API format: the source node's id and the index of its output. */
export type ApiLink = [string, number]

/** One node of a prompt in ComfyUI's API format. */
export interface ApiNode {
  class_type: string
  inputs: Record<string, unknown>
}

/** A prompt in ComfyUI's API format, keyed by node id. */
export type ApiPrompt = Record<string, ApiNode>

/** A value typed into a slot, which replaces the one widget value of its node. */
export type SlotValue = string | number | boolean

/** What a binding changes on one node: whether it runs, and its one widget value when given. */
export interface NodePatch {
  nodeId: number
  on: boolean
  value: SlotValue | null
}

/** ComfyUI's node modes the resolution reads. Any other mode runs. */
const MODE_ALWAYS = 0
const MODE_MUTED = 2
const MODE_BYPASSED = 4

/** The input types the editor draws as a widget, each saving one entry of `widgets_values`. */
const WIDGET_TYPES: ReadonlySet<string> = new Set([
  "INT",
  "FLOAT",
  "STRING",
  "BOOLEAN",
  "COMBO",
  "BOUNDING_BOX",
])

/** A v3 combo whose chosen option brings inputs of its own, saved after its own value. */
const DYNAMIC_COMBO = "COMFY_DYNAMICCOMBO_V3"

/** The v3 types whose inputs are named `parent.child` in a prompt. */
const COMPOUND_TYPES: ReadonlySet<string> = new Set([DYNAMIC_COMBO, "COMFY_AUTOGROW_V3"])

/** Config flags whose widget saves one more value after its own, which a prompt does not take. */
const EXTRA_VALUE_FLAGS = ["control_after_generate", "image_upload"] as const

/** Turns a node's saved `widgets_values` into inputs, or nothing when they are not as expected. */
type NodeQuirk = (values: unknown) => Record<string, unknown> | null

/** Node types whose widgets cannot be read from their spec. A new quirk is a row here. */
export const NODE_QUIRKS: Readonly<Partial<Record<string, NodeQuirk>>> = {
  // Saves [state, text, loras]; the state object belongs to the editor.
  "Lora Loader (LoraManager)": (values) =>
    Array.isArray(values) && values.length === 3 ? { text: values[1], loras: values[2] } : null,
}

const graphInputSchema = z.looseObject({
  name: z.string(),
  type: z.unknown().optional(),
  link: z.number().int().nullable().optional(),
})

const graphNodeSchema = z.looseObject({
  id: z.number().int(),
  type: z.string(),
  title: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  mode: z.number().int().default(MODE_ALWAYS),
  inputs: z.array(graphInputSchema).default([]),
  outputs: z.array(z.looseObject({ type: z.unknown().optional() })).default([]),
  widgets_values: z.unknown().optional(),
})

/** `[linkId, sourceNodeId, sourceSlot, targetNodeId, targetSlot, type]`. */
const graphLinkSchema = z.tuple(
  [z.number().int(), z.number().int(), z.number().int(), z.number().int(), z.number().int()],
  z.unknown()
)

const graphSchema = z.looseObject({
  nodes: z.array(graphNodeSchema),
  links: z.array(graphLinkSchema).default([]),
  definitions: z.looseObject({ subgraphs: z.array(z.unknown()).optional() }).optional(),
})

type GraphNode = z.infer<typeof graphNodeSchema>
type GraphLink = z.infer<typeof graphLinkSchema>

/** One input of a node class as `/object_info` lists it. */
interface SpecEntry {
  name: string
  type: unknown
  config: Record<string, unknown>
  optional: boolean
}

/**
 * Turns a saved graph into the prompt ComfyUI runs, against the classes the instance offers.
 * Patches switch their nodes on or off and set their values first; bypassed nodes are wired
 * through, muted ones and the editor's notes are left out. Any other node whose class the
 * instance does not offer is refused. `now` dates the file names.
 */
export function resolvePrompt(
  graphText: string,
  objectInfo: ObjectInfo,
  patches: NodePatch[],
  now: Date
): ApiPrompt {
  const graph = parseGraph(graphText)
  const nodes = new Map(graph.nodes.map((node) => [node.id, { ...node }]))
  const links = new Map(graph.links.map((link) => [link[0], link]))
  const patchByNode = new Map<number, NodePatch>()
  for (const patch of patches) {
    const node = nodes.get(patch.nodeId)
    if (!node) throw DispatchError.unresolvable(`node ${patch.nodeId} is not in the graph.`)
    node.mode = patchedMode(node.mode, patch.on)
    patchByNode.set(patch.nodeId, patch)
  }
  for (const node of nodes.values()) requireClass(node, objectInfo)

  const runs = (node: GraphNode): boolean =>
    node.mode !== MODE_MUTED && node.mode !== MODE_BYPASSED && node.type in objectInfo

  /** Where a link really comes from once bypassed nodes are wired through, or nothing. */
  const sourceOf = (linkId: number, passed: Set<number>): ApiLink | null => {
    const link = links.get(linkId)
    const source = link ? nodes.get(link[1]) : undefined
    if (!link || !source) return null
    if (source.mode === MODE_BYPASSED) {
      if (passed.has(source.id)) return null
      const type = outputType(source, link)
      const through = source.inputs.find((input) => input.link != null && accepts(input.type, type))
      return through?.link != null ? sourceOf(through.link, passed.add(source.id)) : null
    }
    return runs(source) ? [String(source.id), link[2]] : null
  }

  const prompt: ApiPrompt = {}
  for (const node of nodes.values()) {
    if (!runs(node)) continue
    const entries = specEntries(node, objectInfo[node.type].input)
    const inputs = widgetInputs(node, entries, patchByNode.get(node.id) ?? null)
    for (const input of node.inputs) {
      if (input.link == null) continue
      const source = sourceOf(input.link, new Set())
      if (source) inputs[input.name] = source
    }
    checkNames(node, entries, inputs)
    prompt[String(node.id)] = { class_type: node.type, inputs }
  }
  fillFilenamePrefixes(prompt, nodes, now)
  return prompt
}

/** Refuses a node that would run but whose class the instance does not offer, unless it is a note. */
function requireClass(node: GraphNode, objectInfo: ObjectInfo): void {
  if (node.mode === MODE_MUTED || node.mode === MODE_BYPASSED) return
  if (node.type in objectInfo || NOTE_NODE_TYPES.includes(node.type)) return
  throw DispatchError.unresolvable(
    `${label(node)} is not available on the connected ComfyUI. Install the node there, or bypass it.`
  )
}

/** The mode a patch leaves a node in: on runs it, off keeps a saved mute and bypasses the rest. */
function patchedMode(saved: number, on: boolean): number {
  if (on) return MODE_ALWAYS
  return saved === MODE_MUTED ? MODE_MUTED : MODE_BYPASSED
}

/** Fills the markers of every `filename_prefix`, from the values the prompt now holds. */
function fillFilenamePrefixes(prompt: ApiPrompt, nodes: Map<number, GraphNode>, now: Date): void {
  const named = [...nodes.values()].flatMap((node) => {
    const sent = prompt[String(node.id)]
    if (!sent) return []
    const searchName = node.properties?.["Node name for S&R"]
    return [
      {
        searchName: typeof searchName === "string" ? searchName : null,
        title: node.title ?? null,
        inputs: sent.inputs,
      },
    ]
  })
  for (const node of Object.values(prompt)) {
    const prefix = node.inputs.filename_prefix
    if (typeof prefix === "string") {
      node.inputs.filename_prefix = fillFilenamePrefix(prefix, named, now)
    }
  }
}

function parseGraph(text: string): z.infer<typeof graphSchema> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw DispatchError.unresolvable("the stored graph is not JSON.")
  }
  const graph = graphSchema.safeParse(json)
  if (!graph.success) {
    throw DispatchError.unresolvable("the stored graph does not have the shape ComfyUI saves.")
  }
  if ((graph.data.definitions?.subgraphs?.length ?? 0) > 0) {
    throw DispatchError.unresolvable("it holds subgraphs, which the app cannot send yet.")
  }
  return graph.data
}

/** The inputs a node's widgets give it, with a patched value in place of its one widget's. */
function widgetInputs(
  node: GraphNode,
  entries: SpecEntry[],
  patch: NodePatch | null
): Record<string, unknown> {
  const quirk = NODE_QUIRKS[node.type]
  const widgets = quirk ? quirkWidgets(node, quirk, entries) : readWidgets(node, entries)
  if (patch?.value != null) {
    if (quirk) {
      throw DispatchError.unresolvable(
        `the values of ${label(node)} are mapped as a whole, so a slot cannot set one of them.`
      )
    }
    if (widgets.length !== 1) {
      throw DispatchError.unresolvable(
        `${label(node)} has ${widgets.length} widget values, so a slot cannot set one of them.`
      )
    }
    widgets[0][1] = patch.value
  }
  return Object.fromEntries(widgets)
}

/**
 * The inputs a quirk reads out of a node, refusing values that are not in the shape it knows.
 * An input the class does not list is left out when its value is empty and refused otherwise.
 */
function quirkWidgets(
  node: GraphNode,
  quirk: NodeQuirk,
  entries: SpecEntry[]
): [string, unknown][] {
  const inputs = quirk(node.widgets_values)
  if (!inputs) {
    throw DispatchError.unresolvable(`${label(node)} saves its widget values in an unknown shape.`)
  }
  const listed = new Set(entries.map((entry) => entry.name))
  return Object.entries(inputs).filter(([name, value]) => {
    if (listed.has(name)) return true
    if (isEmptyValue(value)) return false
    throw unlistedInput(node, entries, name)
  })
}

/** Whether a saved value says nothing: an empty string, an empty array or null. */
function isEmptyValue(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0)
}

/** The refusal for an input the node's class does not list, naming the inputs it does. */
function unlistedInput(node: GraphNode, entries: SpecEntry[], name: string): DispatchError {
  return DispatchError.unresolvable(
    `${label(node)} has an input ${name} its class does not list. ` +
      `The class lists: ${entries.map((entry) => entry.name).join(", ")}.`
  )
}

/** Pairs a node's saved widget values with the widget inputs its spec lists, in order. */
function readWidgets(node: GraphNode, entries: SpecEntry[]): [string, unknown][] {
  const saved = node.widgets_values ?? []
  if (!Array.isArray(saved)) {
    throw DispatchError.unresolvable(
      `${label(node)} keeps its widget values in a form the app cannot read.`
    )
  }
  const cursor = { index: 0 }
  const widgets: [string, unknown][] = []
  collectWidgets(node, entries, "", saved, cursor, widgets)
  if (cursor.index !== saved.length) {
    throw DispatchError.unresolvable(
      `${label(node)} saves ${saved.length} widget values where its inputs take ${cursor.index}. ` +
        "The node may have changed since the workflow was saved: open it in ComfyUI and save it again."
    )
  }
  return widgets
}

function collectWidgets(
  node: GraphNode,
  entries: SpecEntry[],
  prefix: string,
  saved: unknown[],
  cursor: { index: number },
  widgets: [string, unknown][]
): void {
  for (const entry of entries) {
    if (!takesWidget(entry.type)) continue
    const name = `${prefix}${entry.name}`
    // A widget added to the class after the graph was saved has no value; optional ones are left out.
    if (cursor.index >= saved.length) {
      if (entry.optional) continue
      throw DispatchError.unresolvable(`${label(node)} saves no value for its input ${name}.`)
    }
    const value = saved[cursor.index]
    widgets.push([name, value])
    cursor.index += 1 + EXTRA_VALUE_FLAGS.filter((flag) => Boolean(entry.config[flag])).length
    if (entry.type !== DYNAMIC_COMBO) continue

    const option = optionsOf(entry.config).find((candidate) => candidate.key === value)
    if (!option) {
      throw DispatchError.unresolvable(
        `${label(node)} has ${JSON.stringify(value)} for ${name}, which is not one of its choices.`
      )
    }
    collectWidgets(node, specEntries(node, option.inputs), `${name}.`, saved, cursor, widgets)
  }
}

/** Refuses an input the node's class does not list, which ComfyUI would refuse less clearly. */
function checkNames(node: GraphNode, entries: SpecEntry[], inputs: Record<string, unknown>): void {
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  for (const name of Object.keys(inputs)) {
    const [head, ...rest] = name.split(".")
    const entry = byName.get(head)
    const known = rest.length === 0 ? entry !== undefined : COMPOUND_TYPES.has(String(entry?.type))
    if (!known) {
      throw unlistedInput(node, entries, name)
    }
  }
}

/** A node class's inputs, required then optional, in the order `/object_info` gives them. */
function specEntries(node: GraphNode, input: unknown): SpecEntry[] {
  if (!isRecord(input)) {
    throw DispatchError.unresolvable(`ComfyUI describes ${label(node)} in an unreadable way.`)
  }
  const entries: SpecEntry[] = []
  for (const section of ["required", "optional"] as const) {
    const listed = input[section]
    if (!isRecord(listed)) continue
    for (const [name, spec] of Object.entries(listed)) {
      if (!Array.isArray(spec) || spec.length === 0) {
        throw DispatchError.unresolvable(
          `ComfyUI describes input ${name} of ${label(node)} in an unreadable way.`
        )
      }
      const config = isRecord(spec[1]) ? spec[1] : {}
      entries.push({ name, type: spec[0], config, optional: section === "optional" })
    }
  }
  return entries
}

/** The options of a dynamic combo, each with the inputs it brings. */
function optionsOf(config: Record<string, unknown>): { key: unknown; inputs: unknown }[] {
  const options = config.options
  return Array.isArray(options)
    ? options.filter(isRecord).map((o) => ({ key: o.key, inputs: o.inputs }))
    : []
}

/** Whether an input of this type is drawn as a widget: a plain value, a combo list or a dynamic combo. */
function takesWidget(type: unknown): boolean {
  return Array.isArray(type) || type === DYNAMIC_COMBO || WIDGET_TYPES.has(String(type))
}

/** The type of the output a link leaves from, as the node declares it or the link records it. */
function outputType(node: GraphNode, link: GraphLink): string {
  return String(node.outputs[link[2]]?.type ?? link[5])
}

/** Whether an input of `inputType`, which may list several, takes an output of `outputType`. */
function accepts(inputType: unknown, outputType: string): boolean {
  const types = String(inputType).split(",")
  return types.includes(outputType) || types.includes("*") || outputType === "*"
}

function label(node: GraphNode): string {
  return `${node.type} (node ${node.id})`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
