import { describe, expect, it, vi } from "vitest"
import type { ClipComposition } from "../../composition/clip"
import type { ChatRequest, LlamaServerClient } from "../llama-server-client"
import { minimaxH3 } from "../targets/minimax-h3"
import { briefComposer } from "./brief"

const fields = {
  integrated_multimodal_description: "[Shot 1] Live-action, a baker opens the shutters.",
  overall_soundscape: "Wooden shutters scrape open over a quiet street.",
  non_diegetic_music: "A soft acoustic-guitar pattern at a moderate tempo.",
}

const composition: ClipComposition = {
  id: 1,
  name: "Bakery",
  form: "t2v",
  frames: [],
  style: "Live-action, cinematic",
  note: "A baker opens the shutters.",
  musicNote: "",
  speakers: [],
  shots: [],
}

function clientAnswering(content: string): { client: LlamaServerClient; requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  const chat = vi.fn(async (request: ChatRequest) => {
    requests.push(request)
    return { content, model: "Qwen3.5-9B" }
  })
  return { client: { chat } as unknown as LlamaServerClient, requests }
}

describe("briefComposer", () => {
  it("returns the fields, the rendered prompt and the model", async () => {
    const { client } = clientAnswering(JSON.stringify(fields))

    const composed = await briefComposer.compose({
      composition,
      model: "Qwen3.5-9B",
      systemPrompt: "You write prompts.",
      target: minimaxH3,
      client,
      scope: { kind: "all" },
    })

    expect(composed.fields).toEqual(fields)
    expect(composed.model).toBe("Qwen3.5-9B")
    expect(composed.prose).toBeNull()
    expect(composed.rendered).toContain("integrated_multimodal_description: [Shot 1]")
  })

  it("sends the system prompt it was given and the clip's note", async () => {
    const { client, requests } = clientAnswering(JSON.stringify(fields))

    await briefComposer.compose({
      composition,
      model: "Qwen3.5-9B",
      systemPrompt: "You write prompts.",
      target: minimaxH3,
      client,
      scope: { kind: "all" },
    })

    expect(requests[0].system).toBe("You write prompts.")
    expect(requests[0].user).toContain("A baker opens the shutters.")
    expect(requests[0].schema).toBe(minimaxH3.brief.schema)
  })

  it("reads an answer that is not the three fields as a bad response", async () => {
    const { client } = clientAnswering('{"description":"only one field"}')

    await expect(
      briefComposer.compose({
        composition,
        model: "Qwen3.5-9B",
        systemPrompt: "You write prompts.",
        target: minimaxH3,
        client,
        scope: { kind: "all" },
      })
    ).rejects.toThrow(expect.objectContaining({ code: "bad-response" }))
  })

  it("refuses a clip with nothing written in its note", async () => {
    const { client } = clientAnswering(JSON.stringify(fields))

    await expect(
      briefComposer.compose({
        composition: { ...composition, note: "   " },
        model: "Qwen3.5-9B",
        systemPrompt: "You write prompts.",
        target: minimaxH3,
        client,
        scope: { kind: "all" },
      })
    ).rejects.toThrow(expect.objectContaining({ code: "nothing-to-write" }))
  })
})
