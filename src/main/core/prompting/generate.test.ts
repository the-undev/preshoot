import { describe, expect, it, vi } from "vitest"
import { generateH3Prompt } from "./generate"
import type { LlamaServerClient } from "./llama-server-client"

const fields = {
  integrated_multimodal_description: "[Shot 1] Live-action, a baker opens the shutters.",
  overall_soundscape: "Wooden shutters scrape open over a quiet street.",
  non_diegetic_music: "A soft acoustic-guitar pattern at a moderate tempo.",
}

/** A client whose one answer is `content`, recording the request it was given. */
function clientAnswering(content: string): LlamaServerClient {
  return {
    chat: vi.fn(async () => ({ content, model: "Qwen3.5-9B" })),
  } as unknown as LlamaServerClient
}

describe("generateH3Prompt", () => {
  it("returns the fields, the rendered prompt and the model", async () => {
    const client = clientAnswering(JSON.stringify(fields))

    const generated = await generateH3Prompt(client, "A baker opens the shutters.")

    expect(generated.fields).toEqual(fields)
    expect(generated.model).toBe("Qwen3.5-9B")
    expect(generated.rendered).toContain("integrated_multimodal_description: [Shot 1]")
    expect(generated.rendered).toContain("non_diegetic_music: A soft acoustic-guitar")
  })

  it("sends the system prompt, the brief and the schema", async () => {
    const client = clientAnswering(JSON.stringify(fields))

    await generateH3Prompt(client, "A baker opens the shutters.")

    expect(client.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("MiniMax H3"),
        user: expect.stringContaining("A baker opens the shutters."),
        schema: expect.objectContaining({ additionalProperties: false }),
      })
    )
  })

  it("reads an answer that is not the three fields as a bad response", async () => {
    const client = clientAnswering('{"description":"only one field"}')

    await expect(generateH3Prompt(client, "A baker.")).rejects.toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })

  it("reads an answer that is not JSON as a bad response", async () => {
    const client = clientAnswering("Here is your prompt!")

    await expect(generateH3Prompt(client, "A baker.")).rejects.toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })
})
