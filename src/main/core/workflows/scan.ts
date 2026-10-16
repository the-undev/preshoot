import { z } from "zod"
import { WorkflowError } from "./errors"

/** What a slot takes, read from the type of the node it fills. */
export const SLOT_KINDS = [
  "text",
  "integer",
  "number",
  "boolean",
  "image",
  "audio",
  "seed",
  "lora",
  "toggle",
] as const

export type SlotKind = (typeof SLOT_KINDS)[number]

/** Where a slot is shown: up front, behind a fold, or not at all. */
export const SLOT_TIERS = ["basic", "advanced", "hidden"] as const

export type SlotTier = (typeof SLOT_TIERS)[number]

/** What an input node takes, and whether its text runs over several lines. */
interface InputNodeKind {
  kind: Exclude<SlotKind, "toggle">
  /** Read for text slots only; every other kind ignores it. */
  multiline: boolean
}

/** The node types that take an input, and what each takes. A new input node is a row here. */
export const INPUT_NODE_KINDS: Readonly<Record<string, InputNodeKind>> = {
  PrimitiveStringMultiline: { kind: "text", multiline: true },
  PrimitiveString: { kind: "text", multiline: false },
  PrimitiveInt: { kind: "integer", multiline: false },
  PrimitiveFloat: { kind: "number", multiline: false },
  PrimitiveBoolean: { kind: "boolean", multiline: false },
  LoadImage: { kind: "image", multiline: false },
  LoadAudio: { kind: "audio", multiline: false },
  RandomNoise: { kind: "seed", multiline: false },
  "Lora Loader (LoraManager)": { kind: "lora", multiline: false },
}

/** The editor's note types, whose text is the workflow's guide and which never reach ComfyUI. */
export const NOTE_NODE_TYPES: readonly string[] = ["MarkdownNote", "Note"]

/** ComfyUI's modes for a node that does not run as saved: muted (2) and bypassed (4). */
const OFF_MODES: readonly number[] = [2, 4]

/** The parts of a graph-format node the scan reads. Everything else is carried untouched. */
const graphNodeSchema = z.looseObject({
  id: z.number().int(),
  type: z.string(),
  title: z.string().optional(),
  mode: z.number().int().default(0),
  widgets_values: z.unknown().optional(),
})

/** A workflow in ComfyUI's graph format, as saved from its editor. */
const graphSchema = z.looseObject({ nodes: z.array(graphNodeSchema) })

export type WorkflowGraph = z.infer<typeof graphSchema>

type GraphNode = WorkflowGraph["nodes"][number]

/** One input of a workflow as the scan found it, before it is stored. */
export interface ScannedSlot {
  nodeId: number
  nodeType: string
  name: string
  kind: SlotKind
  tier: SlotTier
  /** Whether the node is muted or bypassed as saved, so its slot starts off. */
  startsOff: boolean
  /** Whether a text slot's value runs over several lines, so it is typed into a box. */
  multiline: boolean
  position: number
}

/** One note from the graph, shown beside the mapping as the workflow's guide. */
export interface GuideNote {
  nodeId: number
  title: string | null
  text: string
}

/** What a workflow offers to be filled, and what it says about itself. */
export interface WorkflowScan {
  slots: ScannedSlot[]
  guide: GuideNote[]
}

/** Parses a workflow file's text, refusing anything that is not a graph-format workflow. */
export function readGraph(path: string, text: string): WorkflowGraph {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw WorkflowError.unreadable(path, "it is not JSON.")
  }
  const graph = graphSchema.safeParse(json)
  if (!graph.success) {
    throw WorkflowError.unreadable(path, "it has no list of nodes, so it is not a saved workflow.")
  }
  return graph.data
}

/** The slots and the guide of a graph, in the order its nodes are listed. */
export function scanGraph(graph: WorkflowGraph): WorkflowScan {
  const slots: ScannedSlot[] = []
  const guide: GuideNote[] = []
  for (const node of graph.nodes) {
    if (NOTE_NODE_TYPES.includes(node.type)) {
      guide.push({ nodeId: node.id, title: titleOf(node), text: noteText(node) })
      continue
    }
    const slot = slotOf(node)
    if (slot) slots.push({ ...slot, position: slots.length })
  }
  return { slots, guide }
}

/** The slot a node offers, or nothing when it is not one the app can fill or switch. */
function slotOf(node: GraphNode): Omit<ScannedSlot, "position"> | null {
  const title = titleOf(node)
  const startsOff = OFF_MODES.includes(node.mode)
  const input = INPUT_NODE_KINDS[node.type]
  const base = {
    nodeId: node.id,
    nodeType: node.type,
    name: title ?? `${node.type} ${node.id}`,
    startsOff,
  }

  if (input) {
    const tier: SlotTier = startsOff || title === null ? "advanced" : "basic"
    return { ...base, kind: input.kind, multiline: input.multiline, tier }
  }
  // A switched-off node someone named is one they meant to be switched on; an unnamed one is not.
  if (startsOff && title !== null) {
    return { ...base, kind: "toggle", multiline: false, tier: "advanced" }
  }
  return null
}

/** The title a person gave the node, or nothing when it carries only its type. */
function titleOf(node: GraphNode): string | null {
  const title = node.title?.trim() ?? ""
  return title.length > 0 ? title : null
}

/** The text a note node holds, which is its first widget value. */
function noteText(node: GraphNode): string {
  const values = node.widgets_values
  return Array.isArray(values) && typeof values[0] === "string" ? values[0] : ""
}
