import { describe, expect, it, vi } from "vitest"
import type { ClipComposition } from "../../composition/clip"
import type { ChatRequest, LlamaServerClient } from "../llama-server-client"
import { minimaxH3 } from "../targets/minimax-h3"
import { proseComposer } from "./prose"

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  form: "t2v",
  shortEdge: 768,
  aspectRatio: "auto",
  seed: 0,
  frames: [],
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
      beats: [{ subjectName: null, text: "climbs the last steps" }],
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
      beats: [{ subjectName: null, text: "the lamp catches" }],
      dialogue: [],
      soundNote: "",
    },
  ],
}

const answer = JSON.stringify({
  shots: [
    { shot: 1, prose: "The keeper climbs." },
    { shot: 2, prose: "the shot cuts to the lamp catching." },
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
  it("sends the system prompt it was given, with the target's instruction and schema", async () => {
    const { client, requests } = clientAnswering(answer)

    await proseComposer.compose({
      composition,
      model: "Qwen3.5-9B",
      systemPrompt: "You write prompts.",
      target: minimaxH3,
      client,
      scope: { kind: "all" },
    })

    expect(requests[0].system).toBe("You write prompts.")
    expect(requests[0].schema).toBe(minimaxH3.prose.schema)
    expect(requests[0].user).toContain("Shot 1 (starts at 00:00.000")
    expect(requests[0].maxTokens).toBeGreaterThan(1000)
  })

  it("returns the assembled prompt, the model and the prose it kept", async () => {
    const { client } = clientAnswering(answer)

    const composed = await proseComposer.compose({
      composition,
      model: "Qwen3.5-9B",
      systemPrompt: "You write prompts.",
      target: minimaxH3,
      client,
      scope: { kind: "all" },
    })

    expect(composed.model).toBe("Qwen3.5-9B")
    expect(composed.fields.integrated_multimodal_description).toBe(
      "[Shot 1] Live-action, cinematic. The keeper climbs. [Shot 2] At 00:04.500, the shot cuts to the lamp catching."
    )
    expect(composed.rendered).toContain("overall_soundscape: Wind batters the glass.")
    expect(composed.prose?.shots).toEqual([
      { shotId: 11, prose: "The keeper climbs." },
      { shotId: 12, prose: "the shot cuts to the lamp catching." },
    ])
  })

  it("puts the form's opening line in front of the fields", async () => {
    const { client } = clientAnswering(answer)

    const composed = await proseComposer.compose({
      composition: {
        ...composition,
        form: "i2v",
        frames: [
          {
            role: "first",
            imageId: 3,
            fileName: "3-aaa.png",
            mediaType: "image/png",
            assetName: "Keeper",
          },
        ],
      },
      model: "Qwen3.5-9B",
      systemPrompt: "You write prompts.",
      target: minimaxH3,
      client,
      scope: { kind: "all" },
    })

    expect(composed.rendered.startsWith("For the target video, at 0.00 seconds")).toBe(true)
    expect(composed.rendered).toContain("\n\nintegrated_multimodal_description:")
  })

  it("asks for one shot alone when that is the scope", async () => {
    const { client, requests } = clientAnswering(
      JSON.stringify({
        shots: [{ shot: 2, prose: "the shot cuts to the lamp sweeping the water." }],
        overall_soundscape: "Wind batters the glass.",
        non_diegetic_music: "N/A",
      })
    )

    const composed = await proseComposer.compose({
      composition,
      model: "Qwen3.5-9B",
      systemPrompt: "You write prompts.",
      target: minimaxH3,
      client,
      scope: {
        kind: "shot",
        shotId: 12,
        previous: {
          shots: [
            { shotId: 11, prose: "The keeper climbs." },
            { shotId: 12, prose: "the shot cuts to the lamp catching." },
          ],
          soundscape: "Wind batters the glass.",
          music: "N/A",
        },
      },
    })

    expect(requests[0].user).toContain("Write shot 2 again, and only that shot")
    expect(composed.prose?.shots).toEqual([
      { shotId: 11, prose: "The keeper climbs." },
      { shotId: 12, prose: "the shot cuts to the lamp sweeping the water." },
    ])
  })

  it("refuses a clip with no shots", async () => {
    const { client } = clientAnswering(answer)

    await expect(
      proseComposer.compose({
        composition: { ...composition, shots: [] },
        model: "Qwen3.5-9B",
        systemPrompt: "You write prompts.",
        target: minimaxH3,
        client,
        scope: { kind: "all" },
      })
    ).rejects.toThrow(expect.objectContaining({ code: "nothing-to-write" }))
  })

  it("asks again before giving up, and says what was left out", async () => {
    const { client, requests } = clientAnswering(
      JSON.stringify({
        shots: [{ shot: 1, prose: "The keeper climbs." }],
        overall_soundscape: "Wind.",
        non_diegetic_music: "N/A",
      })
    )

    await expect(
      proseComposer.compose({
        composition,
        model: "Qwen3.5-9B",
        systemPrompt: "You write prompts.",
        target: minimaxH3,
        client,
        scope: { kind: "all" },
      })
    ).rejects.toThrow(
      expect.objectContaining({ message: expect.stringContaining("left out shot 2") })
    )
    expect(requests).toHaveLength(2)
  })

  it("keeps what a second go answered when the first left something out", async () => {
    const good = {
      shots: [
        { shot: 1, prose: "The keeper climbs." },
        { shot: 2, prose: "the shot cuts to the lamp catching." },
      ],
      overall_soundscape: "Wind.",
      non_diegetic_music: "N/A",
    }
    const answers = [JSON.stringify({ ...good, shots: [good.shots[0]] }), JSON.stringify(good)]
    const chat = vi.fn(async () => ({ content: answers.shift() ?? "", model: "Qwen3.5-9B" }))
    const client = { chat } as unknown as LlamaServerClient

    const composed = await proseComposer.compose({
      composition,
      model: "Qwen3.5-9B",
      systemPrompt: "You write prompts.",
      target: minimaxH3,
      client,
      scope: { kind: "all" },
    })

    expect(composed.prose?.shots).toHaveLength(2)
  })
})
