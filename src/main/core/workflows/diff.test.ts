import { describe, expect, it } from "vitest"
import { changesNoSlots, diffSlots, type StoredSlotKey } from "./diff"
import { fixtureText } from "./fixtures"
import { readGraph, scanGraph, type WorkflowGraph } from "./scan"

/** The reference-to-video workflow, ready to be edited the way ComfyUI would edit it. */
function r2v(): WorkflowGraph {
  return readGraph("h3-r2v-base.json", fixtureText("h3-r2v-base"))
}

/** The graph's slots as they would be stored after an import, with ids standing in for rows. */
function storedFrom(graph: WorkflowGraph): StoredSlotKey[] {
  return scanGraph(graph).slots.map((slot) => ({
    id: 100 + slot.nodeId,
    nodeId: slot.nodeId,
    nodeType: slot.nodeType,
    name: slot.name,
    displayName: null,
  }))
}

function nodeOf(graph: WorkflowGraph, id: number): WorkflowGraph["nodes"][number] {
  const node = graph.nodes.find((entry) => entry.id === id)
  if (!node) throw new Error(`no node ${id}`)
  return node
}

describe("diffSlots", () => {
  it("finds nothing to change in an unchanged file", () => {
    const stored = storedFrom(r2v())
    const diff = diffSlots(stored, scanGraph(r2v()).slots)

    expect(diff.renamed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.kept).toEqual(stored)
    expect(changesNoSlots(diff)).toBe(true)
  })

  it("reads a retitled node as a rename of the same slot", () => {
    const stored = storedFrom(r2v())
    const edited = r2v()
    nodeOf(edited, 18).title = "Length (s)"

    const diff = diffSlots(stored, scanGraph(edited).slots)

    expect(diff.renamed).toEqual([
      { slotId: 118, nodeId: 18, from: "Duration (s)", to: "Length (s)", displayName: null },
    ])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.kept).toHaveLength(stored.length - 1)
    expect(changesNoSlots(diff)).toBe(false)
  })

  it("carries a renamed slot's display name with it", () => {
    const stored = storedFrom(r2v()).map((slot) =>
      slot.nodeId === 18 ? { ...slot, displayName: "Length" } : slot
    )
    const edited = r2v()
    nodeOf(edited, 18).title = "Length (s)"

    const diff = diffSlots(stored, scanGraph(edited).slots)

    expect(diff.renamed).toEqual([
      { slotId: 118, nodeId: 18, from: "Duration (s)", to: "Length (s)", displayName: "Length" },
    ])
  })

  it("reads a new input node as an added slot", () => {
    const stored = storedFrom(r2v())
    const edited = r2v()
    edited.nodes.push({ id: 33, type: "LoadAudio", title: "Voice", mode: 0 })

    const diff = diffSlots(stored, scanGraph(edited).slots)

    expect(diff.added.map((slot) => [slot.nodeId, slot.name, slot.kind, slot.tier])).toEqual([
      [33, "Voice", "audio", "basic"],
    ])
    expect(diff.removed).toEqual([])
    expect(diff.renamed).toEqual([])
  })

  it("reads a deleted input node as a removed slot", () => {
    const stored = storedFrom(r2v())
    const edited = r2v()
    edited.nodes = edited.nodes.filter((node) => node.id !== 21)

    const diff = diffSlots(stored, scanGraph(edited).slots)

    expect(diff.removed).toEqual([
      { id: 121, nodeId: 21, nodeType: "PrimitiveInt", name: "Turbo steps", displayName: null },
    ])
    expect(diff.added).toEqual([])
  })

  it("reads a node deleted and made again as removed and added, never as kept", () => {
    const stored = storedFrom(r2v())
    const edited = r2v()
    const seed = nodeOf(edited, 23)
    edited.nodes = edited.nodes.filter((node) => node.id !== 23)
    edited.nodes.push({ ...seed, id: 33 })

    const diff = diffSlots(stored, scanGraph(edited).slots)

    expect(diff.removed.map((slot) => [slot.nodeId, slot.name])).toEqual([[23, "Seed"]])
    expect(diff.added.map((slot) => [slot.nodeId, slot.name])).toEqual([[33, "Seed"]])
    expect(diff.kept.map((slot) => slot.nodeId)).not.toContain(23)
    expect(diff.renamed).toEqual([])
  })

  it("reads a node id taken by a node of another type as removed and added", () => {
    const stored = storedFrom(r2v())
    const edited = r2v()
    nodeOf(edited, 20).type = "PrimitiveFloat"

    const diff = diffSlots(stored, scanGraph(edited).slots)

    expect(diff.removed.map((slot) => [slot.nodeId, slot.nodeType])).toEqual([[20, "PrimitiveInt"]])
    expect(diff.added.map((slot) => [slot.nodeId, slot.nodeType])).toEqual([[20, "PrimitiveFloat"]])
  })
})
