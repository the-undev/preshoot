import { CompositionError } from "../../composition/errors"
import {
  clipDurationMs,
  frameOf,
  shotStartMs,
  type ClipComposition,
  type LineComposition,
  type ShotComposition,
  type ThingComposition,
} from "../../composition/clip"
import type { BodyLength, PromptTarget, TargetFields, Vocabularies } from "../target"

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

/** Used when a shot after the first has no transition of its own. */
const DEFAULT_TRANSITION = "the camera cuts to"

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
  const labels = line.speakerIds
    .map((id) => composition.speakers.find((speaker) => speaker.id === id)?.label)
    .filter(Boolean)
  return labels.length > 0 ? `(${labels.join(",")})` : "(S1)"
}

/** The lines of `shot` that have something in them. A line being typed has nothing yet. */
function writtenLines(shot: ShotComposition): LineComposition[] {
  return shot.lines.filter((line) => line.text.trim().length > 0)
}

/** Lowers an opening article so the prose reads on from the phrase written before it. */
function lowerOpeningArticle(text: string): string {
  return text.replace(/^(The|A|An|His|Her|Its|Their)\b/, (word) => word.toLowerCase())
}

/**
 * One line as the prompt carries it. The words stay exactly as typed inside the `<d>` tags, so a
 * marker for a line that crosses a cut or runs past the end of the clip goes after the closing
 * tag rather than inside the span the model reproduces.
 */
function spokenSentence(composition: ClipComposition, line: LineComposition): string {
  const speaker = composition.speakers.find((entry) => entry.id === line.speakerIds[0])
  const who = [speaker?.description.trim(), speakerLabel(composition, line)]
    .filter((part) => part && part.length > 0)
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
  return parts.join(" ")
}

/**
 * Which subjects have been described already. A person, place or object is described the first
 * time it is seen and named afterwards, since the guide wants it to look the same throughout and
 * saying it again every shot reads as a list rather than as a scene.
 */
type Introduced = Set<number>

/** Everything of `shot` that has not been described yet, in the order the shot holds it. */
function newThings(shot: ShotComposition, introduced: Introduced): ThingComposition[] {
  return shot.things.filter((thing) => !introduced.has(thing.id))
}

/** Whether a subject is named by a line of this shot, and so will be described by one. */
function actsInShot(shot: ShotComposition, thing: ThingComposition): boolean {
  return writtenLines(shot).some((line) => line.subjectName === thing.name)
}

/**
 * What the shot opens on: its places and props, and the light they are in. The subjects who do
 * something are left out, because each is described by the first line it does something in.
 */
function openingComposition(shot: ShotComposition, introduced: Introduced): string {
  const scene = newThings(shot, introduced)
    .filter((thing) => !actsInShot(shot, thing))
    .map((thing) => {
      introduced.add(thing.id)
      return thing.description.trim()
    })
    .filter((description) => description.length > 0)

  const lit = shot.lighting ? (LIGHTING_PHRASES[shot.lighting] ?? `in ${shot.lighting}`) : ""
  const opening = [scene.join(", "), lit].filter(Boolean).join(", ")
  return opening.length > 0 ? sentence(capitalise(opening)) : ""
}

/** How a line names whoever it is about: by describing them the first time, by name after that. */
function nameIn(shot: ShotComposition, introduced: Introduced, subjectName: string): string {
  const thing = shot.things.find((entry) => entry.name === subjectName)
  if (!thing || introduced.has(thing.id)) return subjectName
  introduced.add(thing.id)
  const description = thing.description.trim()
  return description.length > 0 ? capitalise(description) : subjectName
}

/** Everything inside one shot, written from the composition alone. */
function describeShot(
  composition: ClipComposition,
  shotId: number,
  introduced: Introduced
): string {
  const shot = composition.shots.find((entry) => entry.id === shotId)
  if (!shot) {
    throw new Error(`Shot ${shotId} is not in clip ${composition.id}`)
  }

  const sentences = [openingComposition(shot, introduced), cameraSentence(shot)]

  // Then what happens, in the order it was written, which is where the dialogue sits as well.
  for (const line of writtenLines(shot)) {
    if (line.kind === "speech") {
      sentences.push(spokenSentence(composition, line))
      continue
    }
    const who = line.subjectName ? `${nameIn(shot, introduced, line.subjectName)} ` : ""
    sentences.push(sentence(capitalise(`${who}${line.text}`)))
  }

  // Anything the shot shows and nothing says a word about still has to be described.
  for (const thing of newThings(shot, introduced)) {
    introduced.add(thing.id)
    sentences.push(sentence(capitalise(thing.description)))
  }
  return sentences.filter(Boolean).join(" ")
}

/** Everything heard in the clip that is not spoken, gathered from the shots that name it. */
function soundscape(composition: ClipComposition): string {
  const notes = composition.shots
    .map((shot) => shot.soundNote.trim())
    .filter((note) => note.length > 0)
    .map((note) => capitalise(sentence(note)))
  return notes.length > 0 ? notes.join(" ") : NOTHING
}

/** The three fields, with the markers, the cut times and the transitions written in. */
function assemble(composition: ClipComposition): TargetFields {
  // Kept across the shots, so a subject is described once and named in every shot after that.
  const introduced: Introduced = new Set()

  const body = composition.shots.map((shot, index) => {
    const text = describeShot(composition, shot.id, introduced)
    if (index === 0) {
      // A clip whose style has been emptied still opens on shot one, just without it.
      return ["[Shot 1]", sentence(composition.style), text].filter(Boolean).join(" ")
    }
    const start = formatCutTime(shotStartMs(composition, shot.id))
    const transition = shot.transition ?? DEFAULT_TRANSITION
    return `[Shot ${index + 1}] At ${start}, ${transition} ${lowerOpeningArticle(text)}`
  })

  return {
    integrated_multimodal_description: body.join(" "),
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
  assemble,
  render: renderH3Prompt,
  instructionLine,
}
