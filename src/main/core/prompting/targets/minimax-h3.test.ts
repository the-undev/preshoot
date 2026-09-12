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

const line = {
  speakerIds: [7],
  language: "English",
  text: "Almost there.",
  offScreen: false,
  crossesCut: false,
  cutOff: false,
}

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  form: "t2v",
  shortEdge: 768,
  aspectRatio: "auto",
  seed: 0,
  frames: [],
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

describe("what a line can say", () => {
  function withLine(over: Partial<typeof line>): ClipComposition {
    return {
      ...composition,
      speakers: [
        ...composition.speakers,
        { id: 8, label: "S2", description: "The radio operator, clipped and flat" },
      ],
      shots: [{ ...composition.shots[0], dialogue: [{ ...line, ...over }] }, composition.shots[1]],
    }
  }

  it("gives a line two speakers share a compound id", () => {
    const instruction = minimaxH3.prose.instruction(withLine({ speakerIds: [7, 8] }), {
      kind: "all",
    })

    expect(instruction).toContain("Says (S1,S2), reproduce exactly:")
  })

  it("asks for the voiceover phrasing when a line is off screen", () => {
    const instruction = minimaxH3.prose.instruction(withLine({ offScreen: true }), { kind: "all" })

    expect(instruction).toContain("says in an off-screen voiceover")
    expect(instruction).toContain("lips remain closed")
  })

  it("asks for scenetrans when a line carries across the cut", () => {
    const instruction = minimaxH3.prose.instruction(withLine({ crossesCut: true }), { kind: "all" })

    expect(instruction).toContain("<scenetrans>")
  })

  it("asks for cutoff when the clip ends over a line", () => {
    const instruction = minimaxH3.prose.instruction(withLine({ cutOff: true }), { kind: "all" })

    expect(instruction).toContain("<cutoff>")
  })

  it("offers the three transitions the guide allows when they are asked for", () => {
    expect(minimaxH3.vocabularies.transitions).toContain("the shot cross-dissolves to")
    expect(minimaxH3.vocabularies.transitions).toContain("the shot fades to")
    expect(minimaxH3.vocabularies.transitions).toContain("the shot wipes to")
  })
})

describe("a line of dialogue with nothing typed in it yet", () => {
  const typing: ClipComposition = {
    ...composition,
    shots: [{ ...composition.shots[0], dialogue: [{ ...line, text: "" }] }, composition.shots[1]],
  }

  it("is left out of the instruction", () => {
    const instruction = minimaxH3.prose.instruction(typing, { kind: "all" })

    expect(instruction).not.toContain("reproduce exactly")
  })

  it("is not required back from the model", () => {
    const answer = {
      shots: [
        { shot: 1, prose: "The keeper climbs." },
        { shot: 2, prose: "The lamp turns." },
      ],
      overall_soundscape: "Wind.",
      non_diegetic_music: "N/A",
    }

    expect(() =>
      minimaxH3.prose.readProse(JSON.stringify(answer), typing, { kind: "all" })
    ).not.toThrow()
  })
})

describe("a clip whose style has been emptied", () => {
  it("opens on shot one without it", () => {
    const assembled = minimaxH3.prose.assemble({ ...composition, style: "" }, prose)

    expect(
      assembled.integrated_multimodal_description.startsWith("[Shot 1] The keeper climbs.")
    ).toBe(true)
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

describe("the line the prompt opens with", () => {
  const picture = {
    role: "first" as const,
    imageId: 3,
    fileName: "3-aaa.png",
    mediaType: "image/png",
    assetName: "Keeper",
  }
  const last = { ...picture, role: "last" as const, imageId: 4 }

  it("says nothing for a clip written from text", () => {
    expect(minimaxH3.instructionLine(composition)).toBe("")
  })

  it("references the opening picture for image to video", () => {
    const line = minimaxH3.instructionLine({
      ...composition,
      form: "i2v",
      frames: [picture],
    })

    expect(line).toBe(
      "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced."
    )
  })

  it("aligns both pictures for first and last frame, to two decimal places", () => {
    const line = minimaxH3.instructionLine({
      ...composition,
      form: "fl2v",
      frames: [picture, last],
    })

    expect(line).toBe(
      "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 7.50-second mark of the target video."
    )
  })

  it("lands on the closing picture for last frame", () => {
    const line = minimaxH3.instructionLine({ ...composition, form: "l2v", frames: [last] })

    expect(line).toBe(
      "How the reference pictures align with the target video — <Picture 1> (from [Shot 2]) aligns with the 7.50-second mark of the target video."
    )
  })

  it("refuses a form whose picture has not been chosen", () => {
    expect(() => minimaxH3.instructionLine({ ...composition, form: "i2v", frames: [] })).toThrow(
      expect.objectContaining({ code: "nothing-to-write" })
    )
    expect(() =>
      minimaxH3.instructionLine({ ...composition, form: "fl2v", frames: [picture] })
    ).toThrow(expect.objectContaining({ code: "nothing-to-write" }))
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
