import { describe, expect, it } from "vitest"
import type { ClipComposition, LineComposition, ShotComposition } from "../../composition/clip"
import type { ParsedClip } from "../target"
import { minimaxH3, renderH3Prompt } from "./minimax-h3"

let nextId = 1

function action(text: string, subjectId: number | null = null): LineComposition {
  return {
    id: nextId++,
    kind: "action",
    subjectIds: subjectId === null ? [] : [subjectId],
    text,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

function speech(text: string, over: Partial<LineComposition> = {}): LineComposition {
  return { ...action(text), kind: "speech", subjectIds: [7], ...over }
}

function shot(over: Partial<ShotComposition> = {}): ShotComposition {
  return {
    id: nextId++,
    durationMs: 4000,
    cameraMotion: null,
    amplitude: null,
    speed: null,
    transition: null,
    lighting: null,
    lines: [],
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
  style: "Live-action",
  note: "",
  musicNote: "A slow piano figure",
  soundscape: "wind battering the glass",
  language: "English",
  cast: [
    { id: 5, kind: "person", name: "Keeper", description: "an elderly man", voice: null },
    { id: 7, kind: "person", name: "Radio", description: "a radio", voice: "flat and clipped" },
  ],
  shots: [
    shot({
      durationMs: 4500,
      lines: [action("rain runs down the glass"), speech("Almost there.")],
    }),
    shot({
      durationMs: 3000,
      transition: "the shot cuts to",
      lines: [action("the lamp turns and catches")],
    }),
  ],
}

/** The prompt a clip writes, which is what a paste would be. */
function promptOf(over: Partial<ClipComposition> = {}): string {
  return renderH3Prompt(minimaxH3.assemble({ ...composition, ...over }))
}

/** Everything a parse says is in the clip, as one string, for asking what survived. */
function everythingIn(parsed: ParsedClip): string {
  return [
    parsed.style,
    parsed.musicNote,
    parsed.note,
    ...parsed.cast.flatMap((subject) => [subject.name, subject.description, subject.voice ?? ""]),
    parsed.soundscape,
    ...parsed.shots.flatMap((one) => one.lines.map((line) => line.text)),
  ].join(" ")
}

describe("reading a prompt this app wrote", () => {
  it("finds a shot for each marker, and how long each one runs", () => {
    const parsed = minimaxH3.parse(promptOf())

    expect(parsed.shots).toHaveLength(2)
    expect(parsed.shots[0].durationMs).toBe(4500)
  })

  it("takes the style, the music and the soundscape out of their fields", () => {
    const parsed = minimaxH3.parse(promptOf())

    expect(parsed.style).toBe("Live-action")
    expect(parsed.musicNote).toBe("A slow piano figure.")
    expect(parsed.soundscape).toBe("Wind battering the glass.")
  })

  it("reads a line of dialogue with its words, its language and who says it", () => {
    const [first] = minimaxH3.parse(promptOf()).shots

    expect(first.lines).toContainEqual(
      expect.objectContaining({
        kind: "speech",
        subject: "Radio",
        text: "Almost there.",
        language: "English",
      })
    )
  })

  it("takes a speaker and their voice into the cast", () => {
    const parsed = minimaxH3.parse(promptOf())

    expect(parsed.cast).toContainEqual({
      name: "Radio",
      description: "",
      voice: "flat and clipped",
    })
  })

  it("reads what is true of a spoken line back off its markers", () => {
    const parsed = minimaxH3.parse(
      promptOf({
        shots: [
          shot({
            lines: [
              speech("Almost there.", { crossesCut: true }),
              speech("Say again.", { offScreen: true }),
              speech("Over.", { cutOff: true }),
            ],
          }),
        ],
      })
    )

    expect(parsed.shots[0].lines.map((line) => line.text)).toEqual([
      "Almost there.",
      "Say again.",
      "Over.",
    ])
    expect(parsed.shots[0].lines[0].crossesCut).toBe(true)
    expect(parsed.shots[0].lines[1].offScreen).toBe(true)
    expect(parsed.shots[0].lines[2].cutOff).toBe(true)
  })

  it("keeps what happens and what is said in the order it was written", () => {
    const parsed = minimaxH3.parse(promptOf())

    expect(parsed.shots[0].lines.map((line) => line.kind)).toEqual(["action", "speech"])
  })

  it("loses none of the words the prompt held", () => {
    const parsed = minimaxH3.parse(promptOf())
    const kept = everythingIn(parsed)

    // The prompt capitalises what it writes, so the words come back as the prompt held them.
    for (const words of [
      "Rain runs down the glass.",
      "Almost there.",
      "The lamp turns and catches.",
      "Wind battering the glass",
      "A slow piano figure",
      "Live-action",
    ]) {
      expect(kept).toContain(words)
    }
  })

  it("keeps a cut that had no shot to land on, as the line it was written as", () => {
    const parsed = minimaxH3.parse(promptOf())

    expect(parsed.shots[1].lines.map((line) => line.text)).toEqual([
      "the shot cuts.",
      "The lamp turns and catches.",
    ])
  })
})

describe("reading a prompt this app did not write", () => {
  it("takes text with no field labels as the whole of the clip", () => {
    const parsed = minimaxH3.parse("A man walks into the sea. The tide takes him.")

    expect(parsed.shots).toHaveLength(1)
    expect(parsed.shots[0].lines.map((line) => line.text)).toEqual([
      "A man walks into the sea.",
      "The tide takes him.",
    ])
  })

  it("keeps a camera move it has never heard of as what it says", () => {
    const parsed = minimaxH3.parse("The camera swoops over the rail and holds.")

    expect(parsed.shots[0].lines[0].text).toBe("The camera swoops over the rail and holds.")
  })

  it("splits on shot markers without cut times, and gives each shot a length", () => {
    const parsed = minimaxH3.parse("[Shot 1] A gull lands. [Shot 2] It takes off again.")

    expect(parsed.shots.map((one) => one.lines[0].text)).toEqual([
      "A gull lands.",
      "It takes off again.",
    ])
    expect(parsed.shots.every((one) => one.durationMs > 0)).toBe(true)
  })

  it("reads dialogue out of a prompt that names its speaker some other way", () => {
    const parsed = minimaxH3.parse(
      "A fireman, gravelly (S1) says: <d>[French] Reculez.</d> He turns away."
    )

    expect(parsed.cast).toEqual([{ name: "A fireman", description: "", voice: "gravelly" }])
    expect(parsed.language).toBe("French")
    expect(parsed.shots[0].lines.map((line) => line.text)).toEqual(["Reculez.", "He turns away."])
  })

  it("does not take an opening word for a style it has never heard of", () => {
    const parsed = minimaxH3.parse("[Shot 1] Grainy super-8. A gull lands.")

    expect(parsed.style).toBe("")
    expect(parsed.shots[0].lines[0].text).toBe("Grainy super-8.")
  })

  it("keeps whatever stood in front of the fields", () => {
    const parsed = minimaxH3.parse(
      "For the target video, <Picture 1> is fully referenced.\n\nintegrated_multimodal_description: A gull lands."
    )

    expect(parsed.note).toBe("For the target video, <Picture 1> is fully referenced.")
    expect(parsed.shots[0].lines[0].text).toBe("A gull lands.")
  })

  it("says nothing rather than N/A for a field that held nothing", () => {
    const parsed = minimaxH3.parse(
      "integrated_multimodal_description: A gull lands.\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A"
    )

    expect(parsed.musicNote).toBe("")
    expect(parsed.soundscape).toBe("")
  })

  it("makes a clip of nothing out of nothing", () => {
    const parsed = minimaxH3.parse("")

    expect(parsed.shots).toHaveLength(1)
    expect(parsed.shots[0].lines).toEqual([])
  })

  it("takes the wrapping out of a prompt that was hard-wrapped where it was pasted from", () => {
    const parsed = minimaxH3.parse(
      [
        "integrated_multimodal_description: [Shot 1] A medium-wide",
        "shot of a small bakery interior before sunrise; warm tungsten light, flour dust in",
        "the air.",
        "",
        "overall_soundscape: The rattling shutter, metal trays set down on stone,",
        "and a doorbell chime.",
      ].join("\n")
    )

    expect(parsed.shots[0].lines[0].text).toBe(
      "A medium-wide shot of a small bakery interior before sunrise; warm tungsten light, flour dust in the air."
    )
    expect(parsed.soundscape).toBe(
      "The rattling shutter, metal trays set down on stone, and a doorbell chime."
    )
  })

  it("keeps a wrapped line of dialogue as one line of words", () => {
    const parsed = minimaxH3.parse("(S1) says <d>[English] First batch\nof the day.</d>")

    expect(parsed.shots[0].lines[0].text).toBe("First batch of the day.")
  })

  it("finds who a label stands for where the prompt first names them, not only where they speak", () => {
    const parsed = minimaxH3.parse(
      [
        "A middle-aged baker (S1), grey apron, lifts the security shutter.",
        "(S1) says in a warm, mid-pitch voice <d>[English] First batch of the day.</d>",
      ].join(" ")
    )

    expect(parsed.cast).toEqual([
      { name: "A middle-aged baker", description: "", voice: "in a warm, mid-pitch voice" },
    ])
    expect(parsed.shots[0].lines).toContainEqual(
      expect.objectContaining({
        kind: "speech",
        subject: "A middle-aged baker",
        text: "First batch of the day.",
      })
    )
  })

  it("takes a voice said after the label when nothing in front of it said one", () => {
    const parsed = minimaxH3.parse(
      "A baker (S1) lifts the shutter. (S1) says in a warm, mid-pitch voice <d>[English] Morning.</d>"
    )

    expect(parsed.cast[0]).toEqual({
      name: "A baker",
      description: "",
      voice: "in a warm, mid-pitch voice",
    })
  })

  it("says nothing about who a label two speakers share stands for", () => {
    const parsed = minimaxH3.parse(
      "The pair (S1,S2) turn. (S1,S2) say together <d>[English] Ready.</d>"
    )

    expect(parsed.cast).toEqual([])
    expect(parsed.shots[0].lines).toContainEqual(
      expect.objectContaining({ kind: "speech", subject: null, text: "Ready." })
    )
  })

  it("reads a prompt with a shot to a line back into the same shots", () => {
    const parsed = minimaxH3.parse(
      ["[Shot 1] A gull lands.", "[Shot 2] At 00:04.000, it takes off again."].join("\n")
    )

    // The writer lowercases the line a cut time runs into, and a parse keeps it as written.
    expect(parsed.shots.map((one) => one.lines[0].text)).toEqual([
      "A gull lands.",
      "it takes off again.",
    ])
    expect(parsed.shots[0].durationMs).toBe(4000)
  })
})
