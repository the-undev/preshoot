import { describe, expect, it, vi } from "vitest"
import { editPrompt } from "./edit"
import type { ChatRequest, LlamaServerClient } from "./llama-server-client"
import { minimaxH3 } from "./targets/minimax-h3"

const previous = {
  integrated_multimodal_description: "[Shot 1] Live-action, cinematic. A woman waits at a stop.",
  overall_soundscape: "Traffic passes.",
  non_diegetic_music: "N/A",
}

const answer = {
  integrated_multimodal_description: "[Shot 1] Live-action, cinematic. A woman waits, smiling.",
  overall_soundscape: "Traffic passes.",
  non_diegetic_music: "N/A",
}

function clientAnswering(content: string): { client: LlamaServerClient; requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  const chat = vi.fn(async (request: ChatRequest) => {
    requests.push(request)
    return { content, model: "Qwen3.5-9B" }
  })
  return { client: { chat } as unknown as LlamaServerClient, requests }
}

describe("editPrompt", () => {
  it("sends the prompt as it stands and the change asked for", async () => {
    const { client, requests } = clientAnswering(JSON.stringify(answer))

    await editPrompt({
      target: minimaxH3,
      client,
      model: "Qwen3.5-9B",
      systemPrompt: "You rewrite prompts.",
      previous,
      instruction: "She is happier.",
    })

    expect(requests[0].system).toBe("You rewrite prompts.")
    expect(requests[0].user).toContain("A woman waits at a stop.")
    expect(requests[0].user).toContain("She is happier.")
    expect(requests[0].model).toBe("Qwen3.5-9B")
  })

  it("returns the rewritten fields and the rendered prompt", async () => {
    const { client } = clientAnswering(JSON.stringify(answer))

    const edited = await editPrompt({
      target: minimaxH3,
      client,
      model: "Qwen3.5-9B",
      systemPrompt: "You rewrite prompts.",
      previous,
      instruction: "She is happier.",
    })

    expect(edited.fields).toEqual(answer)
    expect(edited.rendered).toContain("A woman waits, smiling.")
    expect(edited.model).toBe("Qwen3.5-9B")
    expect(edited.prose).toBeNull()
  })

  it("reads an answer that is not the three fields as a bad response", async () => {
    const { client } = clientAnswering("Here is your prompt!")

    await expect(
      editPrompt({
        target: minimaxH3,
        client,
        model: "Qwen3.5-9B",
        systemPrompt: "You rewrite prompts.",
        previous,
        instruction: "She is happier.",
      })
    ).rejects.toThrow(expect.objectContaining({ code: "bad-response" }))
  })
})
