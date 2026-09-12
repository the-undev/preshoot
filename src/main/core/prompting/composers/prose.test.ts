import { describe, expect, it, vi } from "vitest"
import type { ClipComposition } from "../../composition/clip"
import type { ChatRequest, LlamaServerClient } from "../llama-server-client"
import { minimaxH3 } from "../targets/minimax-h3"
import { proseComposer } from "./prose"

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  style: "Live-action, cinematic",
  note: "A keeper lights the lamp.",
  musicNote: "",
  speakers: [],
  shots: [
    {
      id: 11,
      durationMs: 4500,
      cameraMotion: "push in",
      amplitude: null,
      speed: null,
      transition: null,
      lighting: null,
      things: [],
      action: "climbs the last steps",
      dialogue: [],
      soundNote: "",
    },
    {
      id: 12,
      durationMs: 3000,
      cameraMotion: null,
      amplitude: null,
      speed: null,
      transition: "the shot cuts to",
      lighting: null,
      things: [],
      action: "the lamp catches",
      dialogue: [],
      soundNote: "",
    },
  ],
}

const answer = JSON.stringify({
  shots: [
    { shot: 1, prose: "The keeper climbs." },
    { shot: 2, prose: "The lamp catches." },
  ],
  overall_soundscape: "Wind batters the glass.",
  non_diegetic_music: "N/A",
})

/** A client that answers once, keeping the request it was given. */
function clientAnswering(content: string): {
  client: LlamaServerClient
  requests: ChatRequest[]
} {
  const requests: ChatRequest[] = []
  const chat = vi.fn(async (request: ChatRequest) => {
    requests.push(request)
    return { content, model: "Qwen3.5-9B" }
  })
  return { client: { chat } as unknown as LlamaServerClient, requests }
}

describe("proseComposer", () => {
  it("sends the target's prose prompt, instruction and schema", async () => {
    const { client, requests } = clientAnswering(answer)

    await proseComposer.compose({
      composition,
      target: minimaxH3,
      client,
      scope: { kind: "all" },
    })

    expect(requests[0].system).toBe(minimaxH3.prose.systemPrompt)
    expect(requests[0].schema).toBe(minimaxH3.prose.schema)
    expect(requests[0].user).toContain("Shot 1 (starts at 00:00.000")
    expect(requests[0].maxTokens).toBeGreaterThan(1000)
  })

  it("returns the assembled prompt, the model and the prose it kept", async () => {
    const { client } = clientAnswering(answer)

    const composed = await proseComposer.compose({
      composition,
      target: minimaxH3,
      client,
      scope: { kind: "all" },
    })

    expect(composed.model).toBe("Qwen3.5-9B")
    expect(composed.fields.integrated_multimodal_description).toBe(
      "[Shot 1] Live-action, cinematic. The keeper climbs. [Shot 2] At 00:04.500, the shot cuts to the lamp catches."
    )
    expect(composed.rendered).toContain("overall_soundscape: Wind batters the glass.")
    expect(composed.prose?.shots).toEqual([
      { shotId: 11, prose: "The keeper climbs." },
      { shotId: 12, prose: "The lamp catches." },
    ])
  })

  it("asks for one shot alone when that is the scope", async () => {
    const { client, requests } = clientAnswering(
      JSON.stringify({
        shots: [{ shot: 2, prose: "The lamp sweeps the water." }],
        overall_soundscape: "Wind batters the glass.",
        non_diegetic_music: "N/A",
      })
    )

    const composed = await proseComposer.compose({
      composition,
      target: minimaxH3,
      client,
      scope: {
        kind: "shot",
        shotId: 12,
        previous: {
          shots: [
            { shotId: 11, prose: "The keeper climbs." },
            { shotId: 12, prose: "The lamp catches." },
          ],
          soundscape: "Wind batters the glass.",
          music: "N/A",
        },
      },
    })

    expect(requests[0].user).toContain("Write shot 2 again, and only that shot")
    expect(composed.prose?.shots).toEqual([
      { shotId: 11, prose: "The keeper climbs." },
      { shotId: 12, prose: "The lamp sweeps the water." },
    ])
  })

  it("refuses a clip with no shots", async () => {
    const { client } = clientAnswering(answer)

    await expect(
      proseComposer.compose({
        composition: { ...composition, shots: [] },
        target: minimaxH3,
        client,
        scope: { kind: "all" },
      })
    ).rejects.toThrow(expect.objectContaining({ code: "nothing-to-write" }))
  })

  it("passes on an answer that misses a shot", async () => {
    const { client } = clientAnswering(
      JSON.stringify({
        shots: [{ shot: 1, prose: "The keeper climbs." }],
        overall_soundscape: "Wind.",
        non_diegetic_music: "N/A",
      })
    )

    await expect(
      proseComposer.compose({ composition, target: minimaxH3, client, scope: { kind: "all" } })
    ).rejects.toThrow(expect.objectContaining({ code: "bad-response" }))
  })
})
