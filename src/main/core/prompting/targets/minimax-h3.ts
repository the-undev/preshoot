import { CompositionError } from "../../composition/errors"
import {
  clipDurationMs,
  frameOf,
  shotStartMs,
  speakerLabelOf,
  subjectOf,
  type ClipComposition,
  type LineComposition,
  type ShotComposition,
} from "../../composition/clip"
import type { BodyLength, PromptTarget, TargetFields, Vocabularies } from "../target"
import { parseH3Prompt } from "./minimax-h3-parse"

/** The three fields of a MiniMax H3 text-to-video prompt, in the order they are written. */
const H3_FIELDS = [
  "integrated_multimodal_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const

/** What a field says when the clip gives it nothing, which the guide writes as N/A. */
const NOTHING = "N/A"

/** The words H3 accepts for the parts of a shot the app offers as a list. */
export const H3_VOCABULARIES: Vocabularies = {
  cameraMotions: [
    "zoom in",
    "zoom out",
    "push in",
    "pull out",
    "pan left",
    "pan right",
    "truck left",
    "truck right",
    "tilt up",
    "tilt down",
    "pedestal up",
    "pedestal down",
    "arc shot",
    "tracking shot",
    "static shot",
    "shake slightly",
    "shake strongly",
    "POV",
    "roll clockwise",
    "roll counterclockwise",
  ],
  amplitudes: ["with small amplitude", "with large amplitude"],
  speeds: ["at slow speed", "at fast speed"],
  transitions: [
    "the camera cuts to",
    "the shot cuts to",
    "the shot transitions to",
    "the shot changes to",
    "the shot switches to",
    // The guide allows these three when they are asked for, without giving their exact wording.
    "the shot cross-dissolves to",
    "the shot fades to",
    "the shot wipes to",
  ],
  styles: [
    "Live-action",
    "cinematic",
    "2D-animated",
    "3D CG",
    "claymation",
    "watercolor",
    "vintage film",
  ],
  lightings: [
    "daylight",
    "golden hour",
    "blue hour",
    "night",
    "overcast",
    "harsh sunlight",
    "candlelight",
    "firelight",
    "neon",
    "fluorescent interior",
    "backlit",
    "low-key",
  ],
}

/** How long the main field should run, which the guide sets for a generation body. */
export const H3_BODY: BodyLength = {
  field: "integrated_multimodal_description",
  min: 350,
  max: 500,
}

/** The light as it is said in prose, since the words the picker shows do not all take the same one. */
const LIGHTING_PHRASES: Record<string, string> = {
  daylight: "in daylight",
  "golden hour": "at golden hour",
  "blue hour": "at blue hour",
  night: "at night",
  overcast: "under an overcast sky",
  "harsh sunlight": "in harsh sunlight",
  candlelight: "by candlelight",
  firelight: "by firelight",
  neon: "under neon light",
  "fluorescent interior": "under fluorescent light",
  backlit: "backlit",
  "low-key": "in low-key light",
}

/**
 * The camera move as a sentence rather than as the label the picker shows. The vocabulary mixes
 * verb phrases with nouns, so each one is written out rather than conjugated.
 */
const CAMERA_SENTENCES: Record<string, string> = {
  "zoom in": "The camera zooms in",
  "zoom out": "The camera zooms out",
  "push in": "The camera pushes in",
  "pull out": "The camera pulls out",
  "pan left": "The camera pans left",
  "pan right": "The camera pans right",
  "truck left": "The camera trucks left",
  "truck right": "The camera trucks right",
  "tilt up": "The camera tilts up",
  "tilt down": "The camera tilts down",
  "pedestal up": "The camera rises",
  "pedestal down": "The camera lowers",
  "arc shot": "The camera arcs around the subject",
  "tracking shot": "The camera tracks with the subject",
  "static shot": "The camera holds still",
  "shake slightly": "The camera shakes slightly",
  "shake strongly": "The camera shakes strongly",
  POV: "The shot is from the point of view of the subject",
  "roll clockwise": "The camera rolls clockwise",
  "roll counterclockwise": "The camera rolls counterclockwise",
}

/**
 * The transition as a sentence that stands on its own, for a shot with nothing to cut to. The
 * vocabulary is written to run into what follows, and taking the `to` off the end leaves wording
 * like `the shot changes` that says nothing, so each is written out instead.
 */
const TRANSITION_SENTENCES: Record<string, string> = {
  "the camera cuts to": "the camera cuts",
  "the shot cuts to": "the shot cuts",
  "the shot transitions to": "the shot changes",
  "the shot changes to": "the shot changes",
  "the shot switches to": "the shot changes",
  "the shot cross-dissolves to": "there is a cross-dissolve",
  "the shot fades to": "there is a fade",
  "the shot wipes to": "there is a wipe",
}

/** One of the phrases the guide gives for saying that speech carries over a cut. */
const CONTINUES_ACROSS_CUT = "The line continues seamlessly across the cut."

/** The three fields as one prompt, each under its own label. */
export function renderH3Prompt(fields: TargetFields): string {
  return H3_FIELDS.map((field) => `${field}: ${fields[field] ?? ""}`).join("\n\n")
}

/** A time in the form H3 reads, such as `00:04.500`. */
export function formatCutTime(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const milliseconds = ms % 1000
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0")
}

/** A line of dialogue as H3 keeps it, which is the part the model reproduces word for word. */
export function dialogueTag(language: string, text: string): string {
  return `<d>[${language}] ${text}</d>`
}

/** `text` with its first letter raised, for a fragment that has to start a sentence. */
function capitalise(text: string): string {
  return text.length > 0 ? `${text[0].toUpperCase()}${text.slice(1)}` : text
}

/** `text` ending in a full stop, so joined sentences do not run together or double up. */
function sentence(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length === 0) return ""
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/** How the camera moves in `shot`, as a sentence. Nothing when the shot names no move. */
function cameraSentence(shot: ShotComposition): string {
  if (!shot.cameraMotion) return ""
  const move = CAMERA_SENTENCES[shot.cameraMotion] ?? `The camera ${shot.cameraMotion}`
  return sentence([move, shot.amplitude, shot.speed].filter(Boolean).join(" "))
}

/** What the prompt calls the speakers of one line, which is compound when they share it. */
function speakerLabel(composition: ClipComposition, line: LineComposition): string {
  const labels = line.subjectIds
    .map((id) => speakerLabelOf(composition, id))
    .filter((label): label is string => label !== null)
  return labels.length > 0 ? `(${labels.join(",")})` : "(S1)"
}

/** The lines of `shot` that say something. A line being typed says nothing yet. */
function writtenLines(shot: ShotComposition): LineComposition[] {
  return shot.lines.filter((line) =>
    line.kind === "shows"
      ? line.subjectIds.length > 0 || line.text.trim().length > 0
      : line.text.trim().length > 0
  )
}

/**
 * Lowers the first word so the prose reads on from the phrase written before it, unless that word
 * is one of the cast, whose name is a name wherever in a sentence it lands.
 */
function lowerOpening(composition: ClipComposition, text: string): string {
  const first = /^[^\s,.]+/.exec(text)?.[0] ?? ""
  if (composition.cast.some((subject) => subject.name === first)) return text
  return text.length > 0 ? `${text[0].toLowerCase()}${text.slice(1)}` : text
}

/**
 * One line as the prompt carries it. The words stay exactly as typed inside the `<d>` tags, so a
 * marker for a line that crosses a cut or runs past the end of the clip goes after the closing
 * tag rather than inside the span the model reproduces.
 */
function spokenSentence(
  composition: ClipComposition,
  introduced: Introduced,
  line: LineComposition
): string {
  const speakerId = line.subjectIds[0]
  const speaker = subjectOf(composition, speakerId)
  const voice = speaker?.voice?.trim() ?? ""
  /*
   * The voice is what the prompt has to fix, and how they look stands in for it when none is
   * given. A speaker with a voice is not described here, and is not counted as described, so the
   * first line that does something with them still says how they look.
   */
  const reference =
    voice.length > 0
      ? { name: speaker?.name ?? "", aside: voice }
      : referTo(composition, introduced, speakerId)
  const who = [
    [reference.name, reference.aside].filter(Boolean).join(", "),
    speakerLabel(composition, line),
  ]
    .filter((part) => part.length > 0)
    .join(" ")
  const says = line.offScreen ? "says in an off-screen voiceover" : "says"
  const language = line.language ?? composition.language
  const parts = [`${capitalise(who)} ${says}: ${dialogueTag(language, line.text)}`]

  if (line.crossesCut) {
    parts.push(`<scenetrans> ${CONTINUES_ACROSS_CUT}`)
  }
  if (line.cutOff) {
    parts.push("<cutoff> The clip ends over these words.")
  }
  if (line.offScreen) {
    parts.push("Their lips remain closed.")
  }
  /*
   * A spoken line is a sentence like any other, so it is closed off and whatever follows reads as
   * its own. The stop goes after the closing tag, never inside it, because the model reproduces
   * what the tag holds word for word, and only when the words do not close themselves, so a line
   * typed as a sentence does not come out with two stops around its tag.
   */
  const written = parts.join(" ")
  return /[.!?]$/.test(line.text.trim()) ? written : sentence(written)
}

/**
 * Which subjects have been described already. A person, place or object is described the first
 * time it is seen and named afterwards, since the guide wants it to look the same throughout and
 * saying it again every shot reads as a list rather than as a scene.
 */
type Introduced = Set<number>

/** How a subject is referred to: always by name, with how it looks the first time it is named. */
interface Reference {
  name: string
  /** How they look, said once and set off by commas. Empty after the first time, and for nobody. */
  aside: string
}

/** The reference for `subjectId`, which is what marks it as described from here on. */
function referTo(
  composition: ClipComposition,
  introduced: Introduced,
  subjectId: number
): Reference {
  const subject = subjectOf(composition, subjectId)
  if (!subject) return { name: "", aside: "" }
  if (introduced.has(subject.id)) return { name: subject.name, aside: "" }
  introduced.add(subject.id)
  return { name: subject.name, aside: subject.description.trim() }
}

/**
 * A subject at the head of a sentence, with how it looks set off by commas. The name is always
 * there: a description alone leaves the sentence with nothing doing the acting, and one written
 * as `wearing a space suit` rather than as `a man in a space suit` reads as nonsense without it.
 */
function subjectPhrase(reference: Reference): string {
  if (reference.name.length === 0) return ""
  return reference.aside.length > 0 ? `${reference.name}, ${reference.aside},` : reference.name
}

/**
 * What a `shows` line puts on screen, with `lighting` when it is the line the shot opens on.
 * Nothing at all when the subject was described earlier and this line adds nothing to it.
 */
function shownSentence(
  composition: ClipComposition,
  introduced: Introduced,
  line: LineComposition,
  lighting: string
): string {
  const extra = line.text.trim()
  const subjectId = line.subjectIds[0]
  // A line naming nobody is whatever was typed on it, which is how a shot says what it opens on
  // without first making a cast member of it.
  if (subjectId === undefined) {
    if (extra.length === 0) return ""
    return sentence(capitalise([extra, lighting].filter(Boolean).join(", ")))
  }

  const described = introduced.has(subjectId)
  const reference = referTo(composition, introduced, subjectId)
  if (reference.name.length === 0) return ""
  if (described && extra.length === 0 && lighting.length === 0) return ""
  return sentence(
    capitalise([reference.name, reference.aside, extra, lighting].filter(Boolean).join(", "))
  )
}

/** The light as it is said in prose. Nothing when the shot names none. */
function lightingPhrase(shot: ShotComposition): string {
  if (!shot.lighting) return ""
  return LIGHTING_PHRASES[shot.lighting] ?? `in ${shot.lighting}`
}

/** A shot written out, and whether a transition can run straight into it. */
interface ShotProse {
  text: string
  /** Whether it opens on what the shot shows, which reads on from `the camera cuts to`. */
  opensOnWhatItShows: boolean
}

/**
 * Everything inside one shot, written from the composition alone. The lines are taken in the order
 * they were written, so a shot says what it shows where the writer put it.
 */
function describeShot(
  composition: ClipComposition,
  shotId: number,
  introduced: Introduced
): ShotProse {
  const shot = composition.shots.find((entry) => entry.id === shotId)
  if (!shot) {
    throw new Error(`Shot ${shotId} is not in clip ${composition.id}`)
  }

  const lighting = lightingPhrase(shot)
  const sentences: string[] = []
  let opensOnWhatItShows = false

  writtenLines(shot).forEach((line, index) => {
    if (line.kind === "shows") {
      // The light belongs to the sentence the shot opens on, where it reads as part of the scene.
      const shown = shownSentence(composition, introduced, line, index === 0 ? lighting : "")
      if (shown.length === 0) return
      sentences.push(shown)
      if (index === 0) {
        opensOnWhatItShows = true
        sentences.push(cameraSentence(shot))
      }
      return
    }

    if (line.kind === "speech") {
      sentences.push(spokenSentence(composition, introduced, line))
      return
    }

    const named = line.subjectIds[0]
    const who =
      named === undefined ? "" : `${subjectPhrase(referTo(composition, introduced, named))} `
    sentences.push(sentence(capitalise(`${who.trimStart()}${line.text}`)))
  })

  // A shot that opens on something else still has to say how it is lit and how it is shot.
  if (!opensOnWhatItShows) {
    sentences.unshift(cameraSentence(shot))
    if (lighting.length > 0) sentences.unshift(sentence(`The shot is ${lighting}`))
  }

  return { text: sentences.filter(Boolean).join(" "), opensOnWhatItShows }
}

/** Everything heard in the clip that is not spoken, which the clip holds as one field does. */
function soundscape(composition: ClipComposition): string {
  const heard = composition.soundscape.trim()
  return heard.length > 0 ? capitalise(sentence(heard)) : NOTHING
}

/** The three fields, with the markers, the cut times and the transitions written in. */
function assemble(composition: ClipComposition): TargetFields {
  // Kept across the shots, so a subject is described once and named in every shot after that.
  const introduced: Introduced = new Set()

  const body = composition.shots.map((shot, index) => {
    const prose = describeShot(composition, shot.id, introduced)
    if (index === 0) {
      // A clip whose style has been emptied still opens on shot one, just without it.
      return ["[Shot 1]", sentence(composition.style), prose.text].filter(Boolean).join(" ")
    }
    const start = formatCutTime(shotStartMs(composition, shot.id))
    const transition = shot.transition?.trim() ?? ""
    // A shot cut into with nothing runs straight on from the time it starts at.
    if (transition.length === 0) {
      return `[Shot ${index + 1}] At ${start}, ${lowerOpening(composition, prose.text)}`
    }
    if (prose.opensOnWhatItShows) {
      return `[Shot ${index + 1}] At ${start}, ${transition} ${lowerOpening(composition, prose.text)}`
    }
    // Nothing follows the cut for it to land on, so the cut is written as a sentence of its own.
    const alone = TRANSITION_SENTENCES[transition] ?? transition.replace(/\s+to$/, "")
    const cut = sentence(`At ${start}, ${alone}`)
    return [`[Shot ${index + 1}]`, cut, prose.text].filter(Boolean).join(" ")
  })

  return {
    // A shot to a line. The markers are what divide them, so this is for whoever reads it.
    integrated_multimodal_description: body.join("\n"),
    overall_soundscape: soundscape(composition),
    non_diegetic_music:
      composition.musicNote.trim().length > 0 ? sentence(composition.musicNote) : NOTHING,
  }
}

/**
 * The line the prompt opens with. The wording is fixed by the guide, including where it writes
 * a label with angle brackets and where it writes it without: see docs/h3-mapping.md.
 */
function instructionLine(composition: ClipComposition): string {
  if (composition.form === "t2v") {
    return ""
  }

  const shots = composition.shots.length
  const seconds = (clipDurationMs(composition) / 1000).toFixed(2)
  const first = frameOf(composition, "first")
  const last = frameOf(composition, "last")

  if (composition.form === "i2v") {
    if (!first) {
      throw CompositionError.nothingToWrite("Choose the picture this clip opens on.")
    }
    return `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`
  }

  if (composition.form === "l2v") {
    if (!last) {
      throw CompositionError.nothingToWrite("Choose the picture this clip ends on.")
    }
    return `How the reference pictures align with the target video — <Picture 1> (from [Shot ${shots}]) aligns with the ${seconds}-second mark of the target video.`
  }

  if (!first || !last) {
    throw CompositionError.nothingToWrite("Choose the pictures this clip opens and ends on.")
  }
  return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot ${shots}) aligns with the ${seconds}-second mark of the target video.`
}

/** MiniMax H3, in the four forms the app writes for. */
export const minimaxH3: PromptTarget = {
  id: "minimax-h3",
  name: "MiniMax H3",
  vocabularies: H3_VOCABULARIES,
  body: H3_BODY,
  defaultTransition: "the camera cuts to",
  assemble,
  render: renderH3Prompt,
  parse: parseH3Prompt,
  instructionLine,
}
