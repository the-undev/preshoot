import { describe, expect, it } from "vitest"
import { WorkflowError } from "./errors"
import { fixtureText } from "./fixtures"
import { readGraph, scanGraph, type ScannedSlot } from "./scan"

/** A slot as a row, so a whole workflow's list reads as a table. */
type SlotRow = [number, string, string, ScannedSlot["kind"], ScannedSlot["tier"], boolean]

function rows(slots: ScannedSlot[]): SlotRow[] {
  return slots.map((slot) => [
    slot.nodeId,
    slot.nodeType,
    slot.name,
    slot.kind,
    slot.tier,
    slot.bypassed,
  ])
}

function scanFixture(name: Parameters<typeof fixtureText>[0]): ReturnType<typeof scanGraph> {
  return scanGraph(readGraph(`${name}.json`, fixtureText(name)))
}

/** A graph of the given nodes, each with the fields ComfyUI always writes. */
function graphOf(nodes: { id: number; type: string; title?: string; mode?: number }[]): string {
  return JSON.stringify({ nodes: nodes.map((node) => ({ mode: 0, ...node })), links: [] })
}

describe("scanGraph", () => {
  it("finds every slot of the reference-to-video workflow", () => {
    expect(rows(scanFixture("h3-r2v-base").slots)).toEqual([
      [2, "Lora Loader (LoraManager)", "Your LoRAs (LoRA Manager)", "lora", "basic", false],
      [4, "PrimitiveBoolean", "Turbo", "boolean", "basic", false],
      [10, "LoadImage", "Picture 1", "image", "basic", false],
      [11, "LoadImage", "Picture 2", "image", "basic", false],
      [12, "LoadImage", "Picture 3 (bypassed: Ctrl+B to use)", "image", "advanced", true],
      [13, "LoadImage", "Picture 4 (bypassed: Ctrl+B to use)", "image", "advanced", true],
      [14, "PrimitiveStringMultiline", "Prompt", "text", "basic", false],
      [18, "PrimitiveFloat", "Duration (s)", "number", "basic", false],
      [20, "PrimitiveInt", "Steps", "integer", "basic", false],
      [21, "PrimitiveInt", "Turbo steps", "integer", "basic", false],
      [23, "RandomNoise", "Seed", "seed", "basic", false],
    ])
  })

  it("numbers the slots in the order the graph lists its nodes", () => {
    expect(scanFixture("h3-r2v-base").slots.map((slot) => slot.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
  })

  it("collects the reference-to-video workflow's How to use note as its guide", () => {
    const { guide } = scanFixture("h3-r2v-base")

    expect(guide).toHaveLength(1)
    expect(guide[0].nodeId).toBe(15)
    expect(guide[0].title).toBe("How to use")
    expect(guide[0].text.startsWith("# h3-r2v-base\n\nMiniMax H3 ref2va")).toBe(true)
    expect(guide[0].text).toContain("4. **Turbo.** On: the ref2v 4-step turbo LoRA")
  })

  it("finds every slot of the first-and-last-frame workflow, its bypassed crops as toggles", () => {
    expect(rows(scanFixture("h3-fl2v-base").slots)).toEqual([
      [2, "Lora Loader (LoraManager)", "Your LoRAs (LoRA Manager)", "lora", "basic", false],
      [4, "PrimitiveBoolean", "Turbo", "boolean", "basic", false],
      [10, "LoadImage", "First frame", "image", "basic", false],
      [11, "LoadImage", "Last frame (bypassed: Ctrl+B to use)", "image", "advanced", true],
      [31, "ImageCropV2", "Crop first frame (bypassed: Ctrl+B to use)", "toggle", "advanced", true],
      [32, "ImageCropV2", "Crop last frame (bypassed: Ctrl+B to use)", "toggle", "advanced", true],
      [14, "PrimitiveStringMultiline", "Prompt", "text", "basic", false],
      [16, "PrimitiveFloat", "Duration (s)", "number", "basic", false],
      [18, "PrimitiveInt", "Steps", "integer", "basic", false],
      [19, "PrimitiveInt", "Turbo steps", "integer", "basic", false],
      [21, "RandomNoise", "Seed", "seed", "basic", false],
    ])
    expect(scanFixture("h3-fl2v-base").guide.map((note) => note.title)).toEqual(["How to use"])
  })

  it("finds every slot of the image edit workflow, its bypassed image chain as toggles", () => {
    const shrink = "ImageScaleToTotalPixels"
    const trim = "ResizeImageMaskNode"
    expect(rows(scanFixture("qwen-edit-2511-edit-base").slots)).toEqual([
      [4, "Lora Loader (LoraManager)", "Your LoRAs (LoRA Manager)", "lora", "basic", false],
      [6, "PrimitiveBoolean", "Turbo", "boolean", "basic", false],
      [10, "LoadImage", "Image 1", "image", "basic", false],
      [11, "ImageCropV2", "Crop 1 (bypassed: Ctrl+B to use)", "toggle", "advanced", true],
      [12, shrink, "Shrink 1 (bypassed: Ctrl+B for big photos)", "toggle", "advanced", true],
      [15, "LoadImage", "Image 2 (bypassed: Ctrl+B to use)", "image", "advanced", true],
      [16, "ImageCropV2", "Crop 2 (bypassed: Ctrl+B to use)", "toggle", "advanced", true],
      [17, shrink, "Shrink 2 (bypassed: Ctrl+B for big photos)", "toggle", "advanced", true],
      [18, trim, "Trim 2 to multiples of 16", "toggle", "advanced", true],
      [19, "VAEEncode", "Encode 2", "toggle", "advanced", true],
      [20, "LoadImage", "Image 3 (bypassed: Ctrl+B to use)", "image", "advanced", true],
      [21, "ImageCropV2", "Crop 3 (bypassed: Ctrl+B to use)", "toggle", "advanced", true],
      [22, shrink, "Shrink 3 (bypassed: Ctrl+B for big photos)", "toggle", "advanced", true],
      [23, trim, "Trim 3 to multiples of 16", "toggle", "advanced", true],
      [24, "VAEEncode", "Encode 3", "toggle", "advanced", true],
      [25, "PrimitiveStringMultiline", "Prompt", "text", "basic", false],
      [27, "PrimitiveInt", "Steps", "integer", "basic", false],
      [28, "PrimitiveInt", "Turbo steps", "integer", "basic", false],
      [30, "PrimitiveFloat", "CFG", "number", "basic", false],
      [31, "PrimitiveFloat", "Turbo CFG", "number", "basic", false],
      [33, "RandomNoise", "Seed", "seed", "basic", false],
      [35, "PrimitiveBoolean", "Size from Image 1", "boolean", "basic", false],
    ])
    expect(scanFixture("qwen-edit-2511-edit-base").guide.map((note) => note.nodeId)).toEqual([26])
  })

  it("names an untitled input by its type and id, and puts it under advanced", () => {
    const { slots } = scanGraph(readGraph("x.json", graphOf([{ id: 7, type: "LoadAudio" }])))

    expect(rows(slots)).toEqual([[7, "LoadAudio", "LoadAudio 7", "audio", "advanced", false]])
  })

  it("reads a blank title as no title", () => {
    const { slots } = scanGraph(
      readGraph("x.json", graphOf([{ id: 3, type: "PrimitiveString", title: "  " }]))
    )

    expect(rows(slots)).toEqual([
      [3, "PrimitiveString", "PrimitiveString 3", "text", "advanced", false],
    ])
  })

  it("passes over a bypassed node nobody named, and every node that takes no input", () => {
    const { slots } = scanGraph(
      readGraph(
        "x.json",
        graphOf([
          { id: 1, type: "ImageCropV2", mode: 4 },
          { id: 2, type: "VAEDecode", title: "Decode" },
          { id: 3, type: "KSamplerSelect" },
        ])
      )
    )

    expect(slots).toEqual([])
  })

  it("starts a muted input off, and makes a named muted node a toggle as a bypassed one is", () => {
    const { slots } = scanGraph(
      readGraph(
        "x.json",
        graphOf([
          { id: 1, type: "LoadImage", title: "Picture", mode: 2 },
          { id: 2, type: "ImageCropV2", title: "Crop", mode: 2 },
          { id: 3, type: "ImageCropV2", mode: 2 },
        ])
      )
    )

    expect(rows(slots)).toEqual([
      [1, "LoadImage", "Picture", "image", "advanced", true],
      [2, "ImageCropV2", "Crop", "toggle", "advanced", true],
    ])
  })

  it("collects plain notes as well as markdown ones, in node order, and makes no slot of them", () => {
    const graph = JSON.stringify({
      nodes: [
        { id: 9, type: "Note", mode: 0, widgets_values: ["Second thoughts."] },
        { id: 2, type: "MarkdownNote", title: "How to use", mode: 4, widgets_values: ["# Use"] },
      ],
    })

    expect(scanGraph(readGraph("x.json", graph))).toEqual({
      slots: [],
      guide: [
        { nodeId: 9, title: null, text: "Second thoughts." },
        { nodeId: 2, title: "How to use", text: "# Use" },
      ],
    })
  })

  it("refuses a file that is not JSON", () => {
    expect(() => readGraph("broken.json", "{ nodes: ")).toThrow(WorkflowError)
  })

  it("refuses JSON that is not a graph-format workflow", () => {
    expect(() =>
      readGraph("api.json", JSON.stringify({ "3": { class_type: "KSampler" } }))
    ).toThrow(/no list of nodes/)
  })
})
