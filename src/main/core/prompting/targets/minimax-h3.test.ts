import { describe, expect, it } from "vitest"
import type { ClipComposition, ShotComposition } from "../../composition/clip"
import type { ClipProse } from "../../composition/prose"
import { dialogueTag, formatCutTime, minimaxH3, renderH3Prompt } from "./minimax-h3"

const fields = {
  integrated_multimodal_description: "[Shot 1] Live-action, a baker opens the shutters.",
  overall_soundscape: "Wooden shutters scrape open over a quiet street.",
  non_diegetic_music: "A soft acoustic-guitar pattern at a moderate tempo.",
}

function shot(
  id: number,
  durationMs: number,
  over: Partial<ShotComposition> = {}
): ShotComposition {
  return {
    id,
    durationMs,
    cameraMotion: null,
    amplitude: null,
    speed: null,
    transition: null,
    lighting: null,
    things: [],
    action: `Something happens in shot ${id}`,
    dialogue: [],
    soundNote: "",
    ...over,
  }
}

const line = { speakerId: 7, language: "English", text: "Almost there." }

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  style: "Live-action, cinematic",
  note: "A keeper lights the lamp during a storm.",
  musicNote: "",
  speakers: [{ id: 7, label: "S1", description: "The elderly keeper, low and weathered" }],
  shots: [
    shot(11, 4500, {
      cameraMotion: "push in",
      amplitude: "with small amplitude",
      speed: "at slow speed",
      lighting: "night",
      things: [
        { id: 5, kind: "person", name: "Keeper", description: "an elderly man in oilskins" },
      ],
      action: "climbs the last steps of the tower",
      dialogue: [line],
      soundNote: "wind battering the glass",
    }),
    shot(12, 3000, { transition: "the shot cuts to", action: "the lamp turns and catches" }),
  ],
}

const prose: ClipProse = {
  shots: [
    { shotId: 11, prose: `The keeper climbs. ${dialogueTag("English", "Almost there.")}` },
    { shotId: 12, prose: "The lamp turns and catches." },
  ],
  soundscape: "Wind batters the glass.",
  music: "N/A",
}

describe("renderH3Prompt", () => {
  it("labels the three fields in order, one paragraph each", () => {
    expect(renderH3Prompt(fields)).toBe(
      [
        "integrated_multimodal_description: [Shot 1] Live-action, a baker opens the shutters.",
        "",
        "overall_soundscape: Wooden shutters scrape open over a quiet street.",
        "",
        "non_diegetic_music: A soft acoustic-guitar pattern at a moderate tempo.",
      ].join("\n")
    )
  })
})

describe("formatCutTime", () => {
  it("writes minutes, seconds and milliseconds", () => {
    expect(formatCutTime(0)).toBe("00:00.000")
    expect(formatCutTime(4500)).toBe("00:04.500")
    expect(formatCutTime(72_250)).toBe("01:12.250")
  })
})

describe("the brief strategy", () => {
  it("follows the note with the clip length", () => {
    const message = minimaxH3.brief.userMessage("A baker opens the shutters.")

    expect(message.startsWith("A baker opens the shutters.")).toBe(true)
    expect(message.trimEnd().endsWith("Target length: one clip under 15 seconds.")).toBe(true)
  })

  it("reads the three fields out of an answer", () => {
    expect(minimaxH3.brief.readFields(JSON.stringify(fields))).toEqual(fields)
  })

  it("refuses an answer with a field missing", () => {
    const withoutMusic = {
      integrated_multimodal_description: fields.integrated_multimodal_description,
      overall_soundscape: fields.overall_soundscape,
    }

    expect(() => minimaxH3.brief.readFields(JSON.stringify(withoutMusic))).toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })

  it("refuses an answer that is not JSON", () => {
    expect(() => minimaxH3.brief.readFields("Here is your prompt!")).toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })
})

describe("the edit strategy", () => {
  it("gives the prompt as it stands and the change to make", () => {
    const message = minimaxH3.edit.userMessage(
      "integrated_multimodal_description: a woman waits",
      "She is happier."
    )

    expect(message).toContain("integrated_multimodal_description: a woman waits")
    expect(message).toContain("She is happier.")
  })

  it("reads the rewritten fields back", () => {
    expect(minimaxH3.edit.readFields(JSON.stringify(fields))).toEqual(fields)
  })
})

describe("the prose instruction", () => {
  it("describes every shot with its camera move and its timing", () => {
    const instruction = minimaxH3.prose.instruction(composition, { kind: "all" })

    expect(instruction).toContain("Shot 1 (starts at 00:00.000, runs 4.5 seconds)")
    expect(instruction).toContain("Shot 2 (starts at 00:04.500, runs 3.0 seconds)")
    expect(instruction).toContain("push in with small amplitude at slow speed")
    expect(instruction).toContain("Cut into it with: the shot cuts to")
    expect(instruction).toContain("Shows (person) Keeper: an elderly man in oilskins")
  })

  it("carries the speakers and the dialogue word for word", () => {
    const instruction = minimaxH3.prose.instruction(composition, { kind: "all" })

    expect(instruction).toContain("(S1) The elderly keeper, low and weathered")
    expect(instruction).toContain("<d>[English] Almost there.</d>")
  })

  it("asks for one shot and hands back what is already written", () => {
    const instruction = minimaxH3.prose.instruction(composition, {
      kind: "shot",
      shotId: 12,
      previous: prose,
    })

    expect(instruction).toContain("Write shot 2 again, and only that shot")
    expect(instruction).toContain("Shot 1: The keeper climbs.")
    expect(instruction).not.toContain("Shot 2: The lamp turns and catches.")
  })
})

describe("reading prose back", () => {
  const answer = {
    shots: [
      { shot: 1, prose: `The keeper climbs. ${dialogueTag("English", "Almost there.")}` },
      { shot: 2, prose: "The lamp turns and catches." },
    ],
    overall_soundscape: "Wind batters the glass.",
    non_diegetic_music: "N/A",
  }

  it("keys the prose back to the shots it belongs to", () => {
    const read = minimaxH3.prose.readProse(JSON.stringify(answer), composition, { kind: "all" })

    expect(read.shots.map((entry) => entry.shotId)).toEqual([11, 12])
    expect(read.soundscape).toBe("Wind batters the glass.")
    expect(read.music).toBe("N/A")
  })

  it("refuses an answer with a shot missing", () => {
    const short = { ...answer, shots: [answer.shots[0]] }

    expect(() =>
      minimaxH3.prose.readProse(JSON.stringify(short), composition, { kind: "all" })
    ).toThrow(expect.objectContaining({ code: "bad-response" }))
  })

  it("refuses an answer that drops a line of dialogue", () => {
    const silent = {
      ...answer,
      shots: [{ shot: 1, prose: "The keeper climbs." }, answer.shots[1]],
    }

    expect(() =>
      minimaxH3.prose.readProse(JSON.stringify(silent), composition, { kind: "all" })
    ).toThrow(expect.objectContaining({ code: "bad-response" }))
  })

  it("keeps the other shots when only one was rewritten", () => {
    const one = { ...answer, shots: [{ shot: 2, prose: "The lamp sweeps the water." }] }

    const read = minimaxH3.prose.readProse(JSON.stringify(one), composition, {
      kind: "shot",
      shotId: 12,
      previous: prose,
    })

    expect(read.shots).toEqual([
      { shotId: 11, prose: `The keeper climbs. ${dialogueTag("English", "Almost there.")}` },
      { shotId: 12, prose: "The lamp sweeps the water." },
    ])
  })
})

describe("assembling the prompt", () => {
  it("puts the style on the first shot and a cut time on the rest", () => {
    const assembled = minimaxH3.prose.assemble(composition, prose)

    expect(assembled.integrated_multimodal_description).toBe(
      `[Shot 1] Live-action, cinematic. The keeper climbs. ${dialogueTag("English", "Almost there.")} ` +
        "[Shot 2] At 00:04.500, the shot cuts to the lamp turns and catches."
    )
    expect(assembled.overall_soundscape).toBe("Wind batters the glass.")
    expect(assembled.non_diegetic_music).toBe("N/A")
  })

  it("takes off a marker, a cut time or a transition the model wrote anyway", () => {
    const wordy: ClipProse = {
      ...prose,
      shots: [
        { shotId: 11, prose: "[Shot 1] The keeper climbs." },
        { shotId: 12, prose: "[Shot 2] At 00:04.500, the shot cuts to The lamp turns." },
      ],
    }

    const assembled = minimaxH3.prose.assemble(
      { ...composition, shots: [composition.shots[0], composition.shots[1]] },
      wordy
    )

    expect(assembled.integrated_multimodal_description).toBe(
      "[Shot 1] Live-action, cinematic. The keeper climbs. " +
        "[Shot 2] At 00:04.500, the shot cuts to the lamp turns."
    )
  })

  it("cuts with a plain camera cut when the shot names no transition", () => {
    const withoutTransition = {
      ...composition,
      shots: [composition.shots[0], { ...composition.shots[1], transition: null }],
    }

    const assembled = minimaxH3.prose.assemble(withoutTransition, prose)

    expect(assembled.integrated_multimodal_description).toContain(
      "[Shot 2] At 00:04.500, the camera cuts to"
    )
  })
})

describe("describing a shot without the model", () => {
  it("writes the lighting, the things, the action, the camera and the dialogue", () => {
    const described = minimaxH3.prose.describeShot(composition, 11)

    expect(described).toContain("The lighting is night.")
    expect(described).toContain("Keeper: an elderly man in oilskins.")
    expect(described).toContain("Climbs the last steps of the tower.")
    expect(described).toContain("Camera: push in with small amplitude at slow speed.")
    expect(described).toContain(
      `The elderly keeper, low and weathered (S1) says: ${dialogueTag("English", "Almost there.")}`
    )
  })
})
