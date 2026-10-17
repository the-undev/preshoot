import { describe, expect, it } from "vitest"
import { fixtureText } from "../workflows/fixtures"
import { DispatchError } from "./errors"
import { fillFilenamePrefix } from "./filename-prefix"
import { objectInfoFixture } from "./fixtures"
import { resolvePrompt, type NodePatch } from "./resolve"

const objectInfo = objectInfoFixture()

/** A moment with every date field below ten, so padding shows. */
const now = new Date(2026, 2, 4, 5, 6, 7)

type FixtureName = Parameters<typeof fixtureText>[0]

function resolveFixture(
  name: FixtureName,
  patches: NodePatch[] = []
): ReturnType<typeof resolvePrompt> {
  return resolvePrompt(fixtureText(name), objectInfo, patches, now)
}

/** A fixture graph with some of its nodes changed, for cases no saved workflow shows. */
function editedFixture(
  name: FixtureName,
  edit: (node: { id: number; mode: number; widgets_values?: unknown }) => void
): string {
  const graph = JSON.parse(fixtureText(name))
  graph.nodes.forEach(edit)
  return JSON.stringify(graph)
}

/** A fixture graph with nodes added, unlinked. */
function withNodes(name: FixtureName, added: { id: number; type: string; mode: number }[]): string {
  const graph = JSON.parse(fixtureText(name))
  graph.nodes.push(...added)
  return JSON.stringify(graph)
}

describe("resolvePrompt", () => {
  it("resolves the reference-to-video workflow as saved", () => {
    const prompt = resolveFixture("h3-r2v-base")

    // The note is the editor's own, and Pictures 3 and 4 are bypassed with nothing to pass through.
    expect(Object.keys(prompt)).not.toContain("15")
    expect(Object.keys(prompt)).not.toContain("12")
    expect(Object.keys(prompt)).not.toContain("13")
    expect(prompt["23"]).toEqual({
      class_type: "RandomNoise",
      inputs: { noise_seed: 757358688076805 },
    })
    expect(prompt["2"]).toEqual({
      class_type: "Lora Loader (LoraManager)",
      inputs: { text: "", loras: [], model: ["1", 0] },
    })
    expect(prompt["25"]).toEqual({
      class_type: "MiniMaxH3ReferenceToVideo",
      inputs: {
        prompt: ["14", 0],
        width: ["17", 0],
        height: ["17", 1],
        length: ["19", 1],
        ref_image_size: "match",
        clip: ["7", 0],
        vae: ["8", 0],
        audio_vae: ["9", 0],
        "ref_images.ref_image_0": ["10", 0],
        "ref_images.ref_image_1": ["11", 0],
      },
    })
    expect(prompt["10"]).toEqual({
      class_type: "LoadImage",
      inputs: { image: "Qwen-Image-2512_00003_.png" },
    })
  })

  it("drops the control value saved after a seed or an integer", () => {
    const prompt = resolveFixture("h3-r2v-base")

    expect(prompt["20"].inputs).toEqual({ value: 20 })
  })

  it("lets a link win over the widget value saved for the same input", () => {
    const prompt = resolveFixture("h3-r2v-base")

    expect(prompt["5"].inputs).toEqual({ switch: ["4", 0], on_false: ["2", 0], on_true: ["3", 0] })
  })

  it("reads the inputs a dynamic combo's choice brings, named under it", () => {
    expect(resolveFixture("h3-r2v-base")["32"].inputs).toEqual({
      filename_prefix: "video/2026-03-04/050607_h3-r2v-base_s757358688076805",
      format: "auto",
      "format.codec": "auto",
      video: ["31", 0],
    })
    expect(resolveFixture("qwen-edit-2511-edit-base")["13"].inputs).toEqual({
      resize_type: "scale to multiple",
      "resize_type.multiple": 16,
      scale_method: "area",
      input: ["10", 0],
    })
  })

  it("leaves out optional widgets the class gained after the workflow was saved", () => {
    expect(resolveFixture("h3-r2v-base")["31"].inputs).toEqual({
      fps: 24,
      bit_depth: 8,
      images: ["29", 0],
      audio: ["30", 0],
    })
  })

  it("includes a bypassed picture once it is switched on", () => {
    const prompt = resolveFixture("h3-r2v-base", [{ nodeId: 12, on: true, value: null }])

    expect(prompt["12"]).toEqual({
      class_type: "LoadImage",
      inputs: { image: "Qwen-Image-2512_00003_.png" },
    })
    expect(prompt["25"].inputs["ref_images.ref_image_2"]).toEqual(["12", 0])
    expect(prompt["25"].inputs).not.toHaveProperty("ref_images.ref_image_3")
  })

  it("includes a switched-on node with a widget the spec types as a bounding box", () => {
    const prompt = resolveFixture("h3-fl2v-base", [{ nodeId: 31, on: true, value: null }])

    expect(prompt["31"]).toEqual({
      class_type: "ImageCropV2",
      inputs: { crop_region: { x: 0, y: 0, width: 512, height: 512 }, image: ["10", 0] },
    })
    expect(prompt["12"].inputs.image).toEqual(["31", 0])
  })

  it("wires a chain of bypassed nodes through to the first that runs", () => {
    // Image 1 reaches Trim 1 through Crop 1 and Shrink 1, both bypassed.
    const prompt = resolveFixture("qwen-edit-2511-edit-base")

    expect(prompt["13"].inputs.input).toEqual(["10", 0])
    expect(Object.keys(prompt)).not.toContain("11")
    expect(Object.keys(prompt)).not.toContain("12")
  })

  it("switches a node off when its slot is off", () => {
    const prompt = resolveFixture("qwen-edit-2511-edit-base", [
      { nodeId: 13, on: false, value: null },
    ])

    // Trim 1 passes Image 1 straight on to the encoder; its output type matches one of its inputs.
    expect(Object.keys(prompt)).not.toContain("13")
    expect(prompt["14"].inputs.pixels).toEqual(["10", 0])
  })

  it("drops a muted node without passing anything through it", () => {
    const graph = editedFixture("qwen-edit-2511-edit-base", (node) => {
      if (node.id === 11) node.mode = 2
    })

    const prompt = resolvePrompt(graph, objectInfo, [], now)

    expect(Object.keys(prompt)).not.toContain("11")
    expect(prompt["13"].inputs).not.toHaveProperty("input")
  })

  it("includes a muted picture once it is switched on", () => {
    const graph = editedFixture("h3-r2v-base", (node) => {
      if (node.id === 12) node.mode = 2
    })

    const prompt = resolvePrompt(graph, objectInfo, [{ nodeId: 12, on: true, value: null }], now)

    expect(prompt["12"]).toEqual({
      class_type: "LoadImage",
      inputs: { image: "Qwen-Image-2512_00003_.png" },
    })
    expect(prompt["25"].inputs["ref_images.ref_image_2"]).toEqual(["12", 0])
  })

  it("keeps a muted node dropped when its slot is off", () => {
    const graph = editedFixture("qwen-edit-2511-edit-base", (node) => {
      if (node.id === 11) node.mode = 2
    })

    const prompt = resolvePrompt(graph, objectInfo, [{ nodeId: 11, on: false, value: null }], now)

    expect(Object.keys(prompt)).not.toContain("11")
    expect(prompt["13"].inputs).not.toHaveProperty("input")
  })

  it("keeps a bypassed node wired through when its slot is off", () => {
    const prompt = resolveFixture("qwen-edit-2511-edit-base", [
      { nodeId: 11, on: false, value: null },
    ])

    expect(Object.keys(prompt)).not.toContain("11")
    expect(prompt["13"].inputs.input).toEqual(["10", 0])
  })

  it("names the node whose saved widget values do not match its inputs", () => {
    const graph = editedFixture("h3-r2v-base", (node) => {
      if (node.id === 24) node.widgets_values = ["res_multistep", "extra"]
    })

    expect(() => resolvePrompt(graph, objectInfo, [], now)).toThrow(DispatchError)
    expect(() => resolvePrompt(graph, objectInfo, [], now)).toThrow(
      /KSamplerSelect \(node 24\) saves 2 widget values where its inputs take 1/
    )
  })

  it("names the node missing a value for a required widget", () => {
    const graph = editedFixture("h3-r2v-base", (node) => {
      if (node.id === 26) node.widgets_values = ["simple"]
    })

    expect(() => resolvePrompt(graph, objectInfo, [], now)).toThrow(
      /BasicScheduler \(node 26\) saves no value for its input steps/
    )
  })

  it("refuses a quirk node saved in a shape it does not know", () => {
    const graph = editedFixture("h3-r2v-base", (node) => {
      if (node.id === 2) node.widgets_values = ["", []]
    })

    expect(() => resolvePrompt(graph, objectInfo, [], now)).toThrow(
      /Lora Loader \(LoraManager\) \(node 2\) saves its widget values in an unknown shape/
    )
  })

  it("refuses an input the class does not list", () => {
    const graph = JSON.parse(fixtureText("h3-r2v-base"))
    graph.nodes
      .find((node: { id: number }) => node.id === 27)
      .inputs.push({
        name: "bogus",
        type: "MODEL",
        link: 8,
      })

    expect(() => resolvePrompt(JSON.stringify(graph), objectInfo, [], now)).toThrow(
      /BasicGuider \(node 27\) has an input bogus its class does not list\. The class lists: model, conditioning\./
    )
  })

  it("puts bound values in place of the saved ones", () => {
    const prompt = resolveFixture("h3-r2v-base", [
      { nodeId: 14, on: true, value: "A man walks in." },
      { nodeId: 23, on: true, value: 42 },
      { nodeId: 10, on: true, value: "preshoot/anna.png" },
    ])

    expect(prompt["14"].inputs).toEqual({ value: "A man walks in." })
    expect(prompt["23"].inputs).toEqual({ noise_seed: 42 })
    expect(prompt["10"].inputs).toEqual({ image: "preshoot/anna.png" })
    // The file name takes the seed the run uses.
    expect(prompt["32"].inputs.filename_prefix).toBe("video/2026-03-04/050607_h3-r2v-base_s42")
  })

  it("refuses a value for a node that has no single widget", () => {
    expect(() => resolveFixture("h3-r2v-base", [{ nodeId: 26, on: true, value: 8 }])).toThrow(
      /BasicScheduler \(node 26\) has 3 widget values, so a slot cannot set one of them/
    )
  })

  it("refuses a value for a quirk node, whose values are mapped as a whole", () => {
    expect(() =>
      resolveFixture("h3-r2v-base", [{ nodeId: 2, on: true, value: "<lora:x:1>" }])
    ).toThrow(
      /the values of Lora Loader \(LoraManager\) \(node 2\) are mapped as a whole, so a slot cannot set one of them/
    )
  })

  it("refuses a node whose class the instance does not offer, by its class", () => {
    const graph = withNodes("h3-r2v-base", [{ id: 90, type: "FancyUpscale", mode: 0 }])

    expect(() => resolvePrompt(graph, objectInfo, [], now)).toThrow(
      /FancyUpscale \(node 90\) is not available on the connected ComfyUI/
    )
  })

  it("leaves out a note, and a bypassed or muted node whose class the instance does not offer", () => {
    const graph = withNodes("h3-r2v-base", [
      { id: 90, type: "Note", mode: 0 },
      { id: 91, type: "FancyUpscale", mode: 4 },
      { id: 92, type: "FancyUpscale", mode: 2 },
    ])

    const prompt = resolvePrompt(graph, objectInfo, [], now)

    expect(Object.keys(prompt)).not.toContain("90")
    expect(Object.keys(prompt)).not.toContain("91")
    expect(Object.keys(prompt)).not.toContain("92")
  })

  it("refuses a patch for a node the graph does not have", () => {
    expect(() => resolveFixture("h3-r2v-base", [{ nodeId: 99, on: true, value: null }])).toThrow(
      /node 99 is not in the graph/
    )
  })

  it("resolves each fixture against the instance's classes", () => {
    expect(Object.keys(resolveFixture("h3-fl2v-base"))).toHaveLength(28)
    expect(Object.keys(resolveFixture("qwen-edit-2511-edit-base"))).toHaveLength(41)
  })
})

describe("fillFilenamePrefix", () => {
  const nodes = [
    { searchName: "RandomNoise", title: "Seed", inputs: { noise_seed: 7 } },
    { searchName: "PrimitiveString", title: "Name", inputs: { value: "a/b" } },
  ]

  it("fills dates, values by title or search name, and keeps slashes out of values", () => {
    expect(
      fillFilenamePrefix("%date:yy-M-d h.m.s%_%Seed.noise_seed%_%Name.value%", nodes, now)
    ).toBe("26-3-4 5.6.7_7_a_b")
    expect(fillFilenamePrefix("%RandomNoise.noise_seed%", nodes, now)).toBe("7")
  })

  it("leaves a marker that names nothing as it is", () => {
    expect(fillFilenamePrefix("%Nobody.value%_%width%", nodes, now)).toBe("%Nobody.value%_%width%")
  })
})
