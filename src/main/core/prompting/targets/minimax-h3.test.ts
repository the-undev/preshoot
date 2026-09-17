import { describe, expect, it } from "vitest"
import type { ClipComposition, LineComposition, ShotComposition } from "../../composition/clip"

let nextLineId = 1

/** Something happening, done by a subject or by nobody in particular. */
function action(text: string, subjectId: number | null = null): LineComposition {
  return {
    id: nextLineId++,
    kind: "action",
    subjectIds: subjectId === null ? [] : [subjectId],
    text,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

/** A subject the shot puts on screen, with whatever is true of it here. */
function shows(subjectId: number, text = ""): LineComposition {
  return { ...action(text), kind: "shows", subjectIds: [subjectId] }
}

/** Something said, by the subjects given. */
function speech(text: string, over: Partial<LineComposition> = {}): LineComposition {
  return { ...action(text), kind: "speech", subjectIds: [7], ...over }
}
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
    lines: [action(`Something happens in shot ${id}`)],
    soundNote: "",
    ...over,
  }
}

const composition: ClipComposition = {
  id: 1,
  name: "Lighthouse",
  form: "t2v",
  shortEdge: 768,
  aspectRatio: "16:9",
  frames: [],
  style: "Live-action, cinematic",
  note: "A keeper lights the lamp during a storm.",
  musicNote: "",
  language: "English",
  cast: [
    {
      id: 5,
      kind: "person",
      name: "Keeper",
      description: "an elderly man in oilskins",
      voice: null,
    },
    {
      id: 7,
      kind: "person",
      name: "Radio",
      description: "a radio on the sill",
      voice: "The elderly keeper, low and weathered",
    },
  ],
  shots: [
    shot(11, 4500, {
      cameraMotion: "push in",
      amplitude: "with small amplitude",
      speed: "at slow speed",
      lighting: "night",
      lines: [action("climbs the last steps of the tower", 5), speech("Almost there.")],
      soundNote: "wind battering the glass",
    }),
    shot(12, 3000, {
      transition: "the shot cuts to",
      lines: [action("the lamp turns and catches")],
    }),
  ],
}

/** A place to show, which the clip's own fixture does not hold. */
const cellar = {
  id: 6,
  kind: "place",
  name: "Cellar",
  description: "a low brick cellar",
  voice: null,
}

/** The clip's main field, which is where everything a shot says ends up. */
function body(over: Partial<ClipComposition> = {}): string {
  return minimaxH3.assemble({ ...composition, ...over }).integrated_multimodal_description
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

describe("what a shot says", () => {
  it("names a subject and says how it looks in the line that first names it", () => {
    const written = body()

    expect(written).toContain(
      "Keeper, an elderly man in oilskins, climbs the last steps of the tower."
    )
    expect(written).not.toContain("Keeper: an elderly man in oilskins.")
  })

  it("names a subject it has already described rather than describing it again", () => {
    const written = body({
      shots: [
        shot(11, 4000, {
          lines: [action("climbs the steps", 5), action("reaches for the lamp", 5)],
        }),
      ],
    })

    expect(written).toContain("Keeper, an elderly man in oilskins, climbs the steps.")
    expect(written).toContain("Keeper reaches for the lamp.")
  })

  it("writes the light and the camera as prose rather than as labels", () => {
    const written = body()
    const place = body({
      cast: [...composition.cast, cellar],
      shots: [shot(11, 4000, { lighting: "candlelight", lines: [shows(6)] })],
    })

    expect(place).toContain("Cellar, a low brick cellar, by candlelight.")

    expect(written).toContain("The shot is at night.")
    expect(written).toContain("The camera pushes in with small amplitude at slow speed.")
    expect(written).not.toContain("The lighting is")
    expect(written).not.toContain("Camera:")
  })

  it("describes what a shot shows once, and names it when a later shot shows it again", () => {
    const written = body({
      cast: [...composition.cast, cellar],
      shots: [
        shot(11, 4000, { lines: [shows(6), action("a draught moves the air")] }),
        shot(12, 3000, { lines: [shows(6, "colder now"), action("the door swings shut")] }),
      ],
    })

    expect(written).toContain("Cellar, a low brick cellar.")
    expect(written).toContain("Cellar, colder now.")
  })

  it("writes a line that shows something in its own words, with the light", () => {
    const written = body({
      shots: [
        shot(11, 4000, {
          lighting: "night",
          lines: [{ ...shows(0), subjectIds: [], text: "a cramped lamp room" }],
        }),
      ],
    })

    expect(written).toContain("A cramped lamp room, at night.")
  })

  it("leaves out a line that shows nobody and says nothing", () => {
    const written = body({
      shots: [shot(11, 4000, { lines: [{ ...shows(0), subjectIds: [], text: "  " }] })],
    })

    expect(written).toBe("[Shot 1] Live-action, cinematic.")
  })

  it("says nothing for a shot showing again what it showed before and adding nothing", () => {
    const written = body({
      cast: [...composition.cast, cellar],
      shots: [shot(11, 4000, { lines: [shows(6), shows(6), action("a draught moves the air")] })],
    })

    // Named once by the line that shows it, and not again by the line that shows it a second time.
    expect(written.match(/cellar/gi)).toHaveLength(2)
  })

  it("writes the dialogue with the speaker it was given, named and with their voice", () => {
    expect(body()).toContain(
      `Radio, The elderly keeper, low and weathered (S1) says: ${dialogueTag("English", "Almost there.")}`
    )
  })

  it("says how a speaker with no voice of their own looks, once", () => {
    const written = body({
      cast: [{ ...composition.cast[1], voice: null }],
      shots: [
        shot(11, 4000, {
          lines: [speech("Almost there."), speech("Say again.")],
        }),
      ],
    })

    expect(written).toContain("Radio, a radio on the sill (S1) says:")
    expect(written).toContain("Radio (S1) says:")
  })

  it("still says how a speaker with a voice looks when a line does something with them", () => {
    const written = body({
      shots: [
        shot(11, 4000, {
          lines: [speech("Almost there."), action("crackles and cuts out", 7)],
        }),
      ],
    })

    expect(written).toContain("Radio, a radio on the sill, crackles and cuts out.")
  })

  it("names the subject a line belongs to", () => {
    const written = body({
      shots: [shot(11, 4000, { lines: [action("reaches for the lamp", 5)] })],
    })

    expect(written).toContain("Keeper, an elderly man in oilskins, reaches for the lamp.")
  })

  it("says nothing about who when the line is about the scene", () => {
    const written = body({
      shots: [shot(11, 4000, { lines: [action("rain runs down the glass")] })],
    })

    expect(written).toContain("Rain runs down the glass.")
  })

  it("leaves out a camera move the shot does not name", () => {
    expect(body({ shots: [shot(11, 4000)] })).not.toContain("Camera:")
  })

  it("keeps what happens and what is said in the order they were written", () => {
    const written = body({
      shots: [
        shot(11, 4000, {
          lines: [
            action("the lamp turns"),
            speech("Almost there."),
            action("the beam sweeps the water"),
          ],
        }),
      ],
    })

    const turns = written.indexOf("The lamp turns.")
    const says = written.indexOf("says:")
    const sweeps = written.indexOf("The beam sweeps the water.")
    expect(turns).toBeLessThan(says)
    expect(says).toBeLessThan(sweeps)
  })
})

describe("what a line of dialogue says", () => {
  function written(over: Partial<LineComposition>): string {
    return body({ shots: [shot(11, 4000, { lines: [speech("Almost there.", over)] })] })
  }

  it("gives a line two speakers share a compound id", () => {
    const both = body({
      cast: [
        ...composition.cast,
        {
          id: 8,
          kind: "person",
          name: "Wife",
          description: "the keeper's wife",
          voice: null,
        },
      ],
      shots: [shot(11, 4000, { lines: [speech("Almost there.", { subjectIds: [7, 8] })] })],
    })

    expect(both).toContain("(S1,S2) says:")
  })

  it("speaks the clip's language unless the line names another", () => {
    const clipLanguage = body({
      language: "French",
      shots: [shot(11, 4000, { lines: [speech("Presque.")] })],
    })
    const lineLanguage = body({
      language: "French",
      shots: [shot(11, 4000, { lines: [speech("Almost there.", { language: "English" })] })],
    })

    expect(clipLanguage).toContain(dialogueTag("French", "Presque."))
    expect(lineLanguage).toContain(dialogueTag("English", "Almost there."))
  })

  it("writes the voiceover phrasing and the closed lips when a line is off screen", () => {
    const off = written({ offScreen: true })

    expect(off).toContain("says in an off-screen voiceover")
    expect(off).toContain("Their lips remain closed.")
  })

  it("marks a line that carries across the cut, keeping the words inside the tag", () => {
    const across = written({ crossesCut: true })

    expect(across).toContain(`${dialogueTag("English", "Almost there.")} <scenetrans>`)
    expect(across).toContain("continues seamlessly across the cut")
  })

  it("marks a line the clip ends over", () => {
    expect(written({ cutOff: true })).toContain(
      `${dialogueTag("English", "Almost there.")} <cutoff>`
    )
  })

  it("closes off the sentence after the tag, not inside it", () => {
    const open = body({
      shots: [shot(11, 4000, { lines: [speech("Holy cow look at that view")] })],
    })

    expect(open).toContain(`${dialogueTag("English", "Holy cow look at that view")}.`)
    expect(open).not.toContain("that view.</d>")
  })

  it("leaves a line that closes itself with one stop rather than two", () => {
    expect(written({})).toContain(dialogueTag("English", "Almost there."))
    expect(written({})).not.toContain(`${dialogueTag("English", "Almost there.")}.`)
  })

  it("runs the next line on as its own sentence rather than into the dialogue", () => {
    const after = body({
      shots: [
        shot(11, 4000, {
          lines: [speech("Holy cow look at that view"), action("the beam sweeps the water")],
        }),
      ],
    })

    expect(after).toContain(
      `${dialogueTag("English", "Holy cow look at that view")}. The beam sweeps the water.`
    )
  })

  it("does not close a sentence a marker has already closed", () => {
    expect(written({ crossesCut: true })).toContain("continues seamlessly across the cut.")
    expect(written({ crossesCut: true })).not.toContain("across the cut..")
    expect(written({ cutOff: true })).not.toContain("over these words..")
    expect(written({ offScreen: true })).not.toContain("lips remain closed..")
  })

  it("leaves out a line with nothing typed in it yet", () => {
    expect(written({ text: "   " })).not.toContain("(S1) says:")
  })
})

describe("assembling the prompt", () => {
  it("puts the style on the first shot and a cut time on the rest", () => {
    const written = body()

    expect(written).toContain("[Shot 1] Live-action, cinematic.")
    expect(written).toContain("[Shot 2] At 00:04.500, the shot cuts.")
  })

  it("writes a plain camera cut when the shot names no transition", () => {
    expect(body({ shots: [composition.shots[0], shot(12, 3000)] })).toContain(
      "[Shot 2] At 00:04.500, the camera cuts."
    )
  })

  it("opens on shot one without the style when the style has been emptied", () => {
    const written = body({ style: "" })

    expect(written.startsWith("[Shot 1] The shot is at night.")).toBe(true)
  })

  it("lands a cut on what the shot shows rather than on a label", () => {
    const written = body({
      cast: [...composition.cast, cellar],
      shots: [
        composition.shots[0],
        shot(12, 3000, {
          transition: "the shot cuts to",
          lines: [shows(6), action("the door swings shut")],
        }),
      ],
    })

    expect(written).toContain("[Shot 2] At 00:04.500, the shot cuts to Cellar, a low brick cellar.")
    expect(written).not.toContain("cuts to Cellar:")
  })

  it("lands a cut on a line that shows something in its own words", () => {
    const written = body({
      shots: [
        composition.shots[0],
        shot(12, 3000, {
          transition: "the camera cuts to",
          lines: [
            { ...shows(0), subjectIds: [], text: "the outside of the space station" },
            action("the earth turns below"),
          ],
        }),
      ],
    })

    expect(written).toContain(
      "[Shot 2] At 00:04.500, the camera cuts to the outside of the space station."
    )
    expect(written).toContain("The earth turns below.")
  })

  it("cuts without an object when the shot does not open on what it shows", () => {
    const written = body()

    expect(written).toContain("[Shot 2] At 00:04.500, the shot cuts. The lamp turns and catches.")
  })

  it("writes a transition that stands on its own rather than one missing its object", () => {
    const written = (transition: string): string =>
      body({ shots: [composition.shots[0], shot(12, 3000, { transition })] })

    expect(written("the shot changes to")).toContain("At 00:04.500, the shot changes.")
    expect(written("the shot switches to")).toContain("At 00:04.500, the shot changes.")
    expect(written("the shot fades to")).toContain("At 00:04.500, there is a fade.")
    expect(written("the shot wipes to")).toContain("At 00:04.500, there is a wipe.")
    expect(written("the shot cross-dissolves to")).toContain(
      "At 00:04.500, there is a cross-dissolve."
    )
  })

  it("gathers the sound of every shot into the soundscape", () => {
    const assembled = minimaxH3.assemble({
      ...composition,
      shots: [
        shot(11, 4000, { soundNote: "wind battering the glass" }),
        shot(12, 3000, { soundNote: "the lamp motor grinding" }),
      ],
    })

    expect(assembled.overall_soundscape).toBe("Wind battering the glass. The lamp motor grinding.")
  })

  it("says N/A for a field the clip gives nothing to", () => {
    const assembled = minimaxH3.assemble({ ...composition, shots: [shot(11, 4000)] })

    expect(assembled.overall_soundscape).toBe("N/A")
    expect(assembled.non_diegetic_music).toBe("N/A")
  })

  it("carries the music note into its own field", () => {
    const assembled = minimaxH3.assemble({ ...composition, musicNote: "A slow piano figure" })

    expect(assembled.non_diegetic_music).toBe("A slow piano figure.")
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
