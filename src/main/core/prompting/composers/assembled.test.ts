import { describe, expect, it, vi } from "vitest"
import type { ClipComposition, ShotComposition } from "../../composition/clip"
import type { LlamaServerClient } from "../llama-server-client"
import { minimaxH3 } from "../targets/minimax-h3"
import { assembledComposer } from "./assembled"

/** A client that fails the test if the composer reaches for it. */
const refusingClient = {
  chat: vi.fn(() => {
    throw new Error("the assembled composer must not call the model")
  }),
} as unknown as LlamaServerClient

function shot(id: number, over: Partial<ShotComposition> = {}): ShotComposition {
  return {
    id,
    durationMs: 4000,
    cameraMotion: null,
    amplitude: null,
    speed: null,
    transition: null,
    lighting: null,
    things: [],
    action: `Shot ${id} happens`,
    dialogue: [],
    soundNote: "",
    ...over,
  }
}

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  style: "Live-action, cinematic",
  note: "",
  musicNote: "A slow piano figure.",
  speakers: [],
  shots: [
    shot(11, { cameraMotion: "push in", soundNote: "Wind batters the glass." }),
    shot(12, { transition: "the shot cuts to", soundNote: "The lamp mechanism grinds." }),
  ],
}

describe("assembledComposer", () => {
  it("builds the prompt without calling the model", async () => {
    const composed = await assembledComposer.compose({
      composition,
      target: minimaxH3,
      client: refusingClient,
      scope: { kind: "all" },
    })

    expect(composed.model).toBeNull()
    expect(composed.fields.integrated_multimodal_description).toContain(
      "[Shot 1] Live-action, cinematic. Shot 11 happens."
    )
    expect(composed.fields.integrated_multimodal_description).toContain(
      "[Shot 2] At 00:04.000, the shot cuts to"
    )
  })

  it("joins the shots' sound notes and takes the music from the clip", async () => {
    const composed = await assembledComposer.compose({
      composition,
      target: minimaxH3,
      client: refusingClient,
      scope: { kind: "all" },
    })

    expect(composed.fields.overall_soundscape).toBe(
      "Wind batters the glass. The lamp mechanism grinds."
    )
    expect(composed.fields.non_diegetic_music).toBe("A slow piano figure.")
  })

  it("says N/A where the clip says nothing", async () => {
    const silent = {
      ...composition,
      musicNote: "",
      shots: composition.shots.map((entry) => ({ ...entry, soundNote: "" })),
    }

    const composed = await assembledComposer.compose({
      composition: silent,
      target: minimaxH3,
      client: refusingClient,
      scope: { kind: "all" },
    })

    expect(composed.fields.overall_soundscape).toBe("N/A")
    expect(composed.fields.non_diegetic_music).toBe("N/A")
  })

  it("refuses a clip with no shots", async () => {
    await expect(
      assembledComposer.compose({
        composition: { ...composition, shots: [] },
        target: minimaxH3,
        client: refusingClient,
        scope: { kind: "all" },
      })
    ).rejects.toThrow(expect.objectContaining({ code: "nothing-to-write" }))
  })
})
