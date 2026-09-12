import { z } from "zod"
import { shotStartMs, type ClipComposition, type ShotComposition } from "../../composition/clip"
import { PromptServiceError } from "../errors"
import type { ClipProse, ComposeScope, PromptTarget, TargetFields, Vocabularies } from "../target"

/** The three fields of a MiniMax H3 text-to-video prompt, in the order they are written. */
const H3_FIELDS = [
  "integrated_multimodal_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const

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

/** The answer the model gives when it writes the prose of a clip. */
export const H3_PROSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          shot: { type: "integer" },
          prose: { type: "string" },
        },
        required: ["shot", "prose"],
        additionalProperties: false,
      },
    },
    overall_soundscape: { type: "string" },
    non_diegetic_music: { type: "string" },
  },
  required: ["shots", "overall_soundscape", "non_diegetic_music"],
  additionalProperties: false,
}

const h3ProseAnswerSchema = z.object({
  shots: z.array(z.object({ shot: z.number().int(), prose: z.string().min(1) })),
  overall_soundscape: z.string().min(1),
  non_diegetic_music: z.string().min(1),
})

/** The answer the model gives when it writes a whole prompt from a note alone. */
export const H3_PROMPT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    integrated_multimodal_description: { type: "string" },
    overall_soundscape: { type: "string" },
    non_diegetic_music: { type: "string" },
  },
  required: [...H3_FIELDS],
  additionalProperties: false,
}

const h3PromptSchema = z.object({
  integrated_multimodal_description: z.string().min(1),
  overall_soundscape: z.string().min(1),
  non_diegetic_music: z.string().min(1),
})

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

/** A line of dialogue as H3 keeps it, which is the part the model must reproduce word for word. */
export function dialogueTag(language: string, text: string): string {
  return `<d>[${language}] ${text}</d>`
}

/** `text` ending in a full stop, so joined sentences do not run together or double up. */
function sentence(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length === 0) return ""
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/** How the camera moves in `shot`, as the instruction states it. */
function cameraPhrase(shot: ShotComposition): string {
  if (!shot.cameraMotion) return "not specified, choose one that suits the action"
  return [shot.cameraMotion, shot.amplitude, shot.speed].filter(Boolean).join(" ")
}

/** The shot's number in the clip, which is what the model is asked to key its answer by. */
function shotNumber(composition: ClipComposition, shotId: number): number {
  return composition.shots.findIndex((shot) => shot.id === shotId) + 1
}

/** Every dialogue line of `shot` as the exact string that has to come back. */
function dialogueTags(shot: ShotComposition): string[] {
  return shot.dialogue.map((line) => dialogueTag(line.language, line.text))
}

/** One shot as the instruction describes it to the model. */
function shotBlock(composition: ClipComposition, shot: ShotComposition, index: number): string {
  const start = shotStartMs(composition, shot.id)
  const lines = [
    `Shot ${index + 1} (starts at ${formatCutTime(start)}, runs ${(shot.durationMs / 1000).toFixed(1)} seconds):`,
    `  Camera: ${cameraPhrase(shot)}`,
  ]
  if (index > 0) {
    lines.push(`  Cut into it with: ${shot.transition ?? DEFAULT_TRANSITION}`)
  }
  if (shot.lighting) {
    lines.push(`  Lighting: ${shot.lighting}`)
  }
  for (const thing of shot.things) {
    lines.push(`  Shows (${thing.kind}) ${thing.name}: ${thing.description}`)
  }
  lines.push(`  Happens: ${sentence(shot.action)}`)
  if (shot.soundNote.trim().length > 0) {
    lines.push(`  Sound: ${sentence(shot.soundNote)}`)
  }
  for (const line of shot.dialogue) {
    const speaker = composition.speakers.find((entry) => entry.id === line.speakerId)
    const label = speaker ? `(${speaker.label})` : "(S1)"
    lines.push(`  Says ${label}, reproduce exactly: ${dialogueTag(line.language, line.text)}`)
  }
  return lines.join("\n")
}

/** The user message for a prose request: the whole clip, and which shots to write. */
function proseInstruction(composition: ClipComposition, scope: ComposeScope): string {
  const parts = [
    `Clip: ${composition.name}`,
    `Style: ${composition.style}`,
    composition.note.trim().length > 0 ? `Note: ${sentence(composition.note)}` : "",
    composition.musicNote.trim().length > 0 ? `Music: ${sentence(composition.musicNote)}` : "",
  ].filter(Boolean)

  if (composition.speakers.length > 0) {
    parts.push(
      ["Speakers:", ...composition.speakers.map((s) => `  (${s.label}) ${s.description}`)].join(
        "\n"
      )
    )
  }

  parts.push(
    composition.shots.map((shot, index) => shotBlock(composition, shot, index)).join("\n\n")
  )

  if (scope.kind === "shot") {
    const number = shotNumber(composition, scope.shotId)
    const others = scope.previous.shots
      .filter((written) => written.shotId !== scope.shotId)
      .map((written) => `Shot ${shotNumber(composition, written.shotId)}: ${written.prose}`)
    parts.push(
      [
        `Write shot ${number} again, and only that shot. Everything else is already written and must not change:`,
        ...others,
      ].join("\n")
    )
  } else {
    parts.push(
      `Write the prose of every shot, keyed by its number: ${composition.shots.map((_, index) => index + 1).join(", ")}.`
    )
  }

  return parts.join("\n\n")
}

/** Which shot numbers an answer has to carry for `scope`. */
function requiredNumbers(composition: ClipComposition, scope: ComposeScope): number[] {
  if (scope.kind === "shot") return [shotNumber(composition, scope.shotId)]
  return composition.shots.map((_, index) => index + 1)
}

/**
 * Reads an answer into prose covering every shot of the clip. A single-shot answer is merged over
 * the prose already written, so what comes back always covers the whole clip.
 */
function readProse(content: string, composition: ClipComposition, scope: ComposeScope): ClipProse {
  const answer = h3ProseAnswerSchema.safeParse(parseJson(content))
  if (!answer.success) {
    throw PromptServiceError.badResponse()
  }

  const written = new Map<number, string>()
  for (const entry of answer.data.shots) {
    const shot = composition.shots[entry.shot - 1]
    if (shot) written.set(shot.id, entry.prose)
  }

  for (const number of requiredNumbers(composition, scope)) {
    const shot = composition.shots[number - 1]
    if (!shot || !written.has(shot.id)) {
      throw PromptServiceError.badResponse()
    }
    const prose = written.get(shot.id) ?? ""
    for (const tag of dialogueTags(shot)) {
      if (!prose.includes(tag)) {
        throw PromptServiceError.badResponse()
      }
    }
  }

  const kept = scope.kind === "shot" ? scope.previous.shots : []
  const shots = composition.shots.map((shot) => ({
    shotId: shot.id,
    prose: written.get(shot.id) ?? kept.find((entry) => entry.shotId === shot.id)?.prose ?? "",
  }))

  return {
    shots,
    soundscape: answer.data.overall_soundscape,
    music: answer.data.non_diegetic_music,
  }
}

/** Puts the markers, the cut times and the transitions around prose that covers every shot. */
function assemble(composition: ClipComposition, prose: ClipProse): TargetFields {
  const body = composition.shots.map((shot, index) => {
    const written = prose.shots.find((entry) => entry.shotId === shot.id)
    if (!written) {
      throw new Error(`Shot ${shot.id} of clip ${composition.id} has no prose`)
    }
    if (index === 0) {
      return `[Shot 1] ${composition.style}, ${written.prose}`
    }
    const start = formatCutTime(shotStartMs(composition, shot.id))
    return `[Shot ${index + 1}] At ${start}, ${shot.transition ?? DEFAULT_TRANSITION} ${written.prose}`
  })

  return {
    integrated_multimodal_description: body.join(" "),
    overall_soundscape: prose.soundscape,
    non_diegetic_music: prose.music,
  }
}

/** One shot written from the composition alone, for the way that calls no model. */
function describeShot(composition: ClipComposition, shotId: number): string {
  const shot = composition.shots.find((entry) => entry.id === shotId)
  if (!shot) {
    throw new Error(`Shot ${shotId} is not in clip ${composition.id}`)
  }

  const sentences: string[] = []
  if (shot.lighting) {
    sentences.push(sentence(`The lighting is ${shot.lighting}`))
  }
  for (const thing of shot.things) {
    sentences.push(sentence(`${thing.name}: ${thing.description}`))
  }
  sentences.push(sentence(shot.action))
  if (shot.cameraMotion) {
    // The vocabulary mixes verb phrases with nouns, so this way states the move rather than conjugating it.
    sentences.push(sentence(`Camera: ${cameraPhrase(shot)}`))
  }
  for (const line of shot.dialogue) {
    const speaker = composition.speakers.find((entry) => entry.id === line.speakerId)
    const who = speaker ? `${speaker.description} (${speaker.label})` : "The speaker (S1)"
    sentences.push(`${who} says: ${dialogueTag(line.language, line.text)}`)
  }
  return sentences.filter(Boolean).join(" ")
}

/** The brief as the user message, with the clip length the model has to work to. */
export function h3UserMessage(note: string): string {
  return `${note}\n\nTarget length: one clip under 15 seconds.`
}

/** Reads a whole-prompt answer into the three fields. */
function readFields(content: string): TargetFields {
  const answer = h3PromptSchema.safeParse(parseJson(content))
  if (!answer.success) {
    throw PromptServiceError.badResponse()
  }
  return answer.data
}

/** The answer as JSON, or `undefined` when the model wrote something else. */
function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

/** Distilled from the MiniMax H3 prompt writing guide. Sent unchanged, so llama-server caches its prefix. */
export const H3_SYSTEM_PROMPT = `You write prompts for the MiniMax H3 video generation model. The user gives a brief. You turn it into one complete prompt for a single clip.

Answer with JSON holding exactly three string fields: integrated_multimodal_description, overall_soundscape, non_diegetic_music.

integrated_multimodal_description is the main body. Everything in it must be visible or audible. Begin with "[Shot 1]" followed by the overall style (for example Live-action, cinematic, 2D-animated, 3D CG, claymation, watercolor, vintage film) and the opening composition. Then describe the subjects, their appearance and position, the scene and key props, the actions and reactions in order, and any dialogue. Give the first shot no timestamp. Start each later shot with a sequential number and a strictly increasing cut time, for example "[Shot 2] At 00:03.500, the camera cuts to". Use "the camera cuts to", "the shot cuts to", "the shot transitions to", "the shot changes to" or "the shot switches to". Cut only to show new information about subject, space, state, viewpoint or time; for a change of distance or slight angle, move the camera instead. Prefer one or two shots.

Write camera motion as a natural English action inside the shot, using these motion types: zoom in, zoom out, push in, pull out, pan left, pan right, truck left, truck right, tilt up, tilt down, pedestal up, pedestal down, arc shot, tracking shot, static shot, shake slightly, shake strongly, POV, roll clockwise, roll counterclockwise. Add "with small amplitude" or "with large amplitude" and "at slow speed" or "at fast speed" only when they matter. Example: "The camera pushes in with small amplitude at slow speed toward the folded letter in her hands."

Speakers get stable IDs such as (S1) and (S2), introduced with enough detail to fix their identity: character type, age, gender, on or off screen, pitch, timbre, pace or accent. Spoken words go inside <d> with a language tag, kept verbatim: The young woman with a quiet, breathy voice (S1) says: <d>[English] I get off at the next station.</d>. Voiceover uses the exact phrase "says in an off-screen voiceover" and is followed by a statement that the on-screen character's lips remain closed. Text visible on screen goes in double quotation marks, verbatim. Diegetic music, radio, television and phone audio belong here, not in the other two fields.

overall_soundscape is one paragraph of one to four sentences summarising ambient sound, physical action sounds and non-verbal human sounds across the whole clip: wind, rain, traffic, footsteps, fabric, impacts, breathing, laughter. Do not repeat dialogue, singing or diegetic music. Use "N/A" only when the brief asks for complete silence.

non_diegetic_music is one to three sentences describing music only the audience hears: instrumentation, tempo, rhythm and changes in dynamics. Do not use mood words or explain what the music is for. Use "N/A" when there is no score.

Add scene, character, action and sound detail that stays consistent with the brief. Keep the whole clip under 15 seconds.

Example answer for the brief "A baker opens the shutters of a small street bakery before sunrise":

integrated_multimodal_description: [Shot 1] Live-action, cinematic, a medium-wide shot frames a baker opening the shutters of a small street bakery before sunrise. The camera pushes in with small amplitude at slow speed as the middle-aged baker with a calm, slightly raspy voice (S1) places a fresh loaf on the wooden counter and says: <d>[English] First batch of the morning.</d> [Shot 2] At 00:05.000, the camera cuts to a close-up of steam rising from the sliced bread while the baker's final words carry over from the previous shot.

overall_soundscape: Wooden shutters scrape open over a quiet street as trays clink softly inside the bakery. The doorbell rings once, followed by light footsteps and the crisp sound of bread being sliced.

non_diegetic_music: A soft acoustic-guitar pattern at a moderate tempo, joined by sparse upright-bass notes and a gentle fade at the end.`

/** Shorter than the whole-prompt one, because the app has already decided everything mechanical. */
export const H3_PROSE_SYSTEM_PROMPT = `You write the prose of each shot in a clip for the MiniMax H3 video generation model. The shots, their camera moves, their cuts and their timings are already decided. You write only what happens inside each shot.

Answer with JSON: shots, an array of objects holding shot, the number you were given, and prose, what you wrote for it; plus overall_soundscape and non_diegetic_music for the whole clip.

Do not write shot markers such as "[Shot 2]", do not write timestamps, and do not write the transition phrase. The app puts those around your prose. Everything you write must be visible or audible.

Write the camera motion you were given into the action sentence as natural English, keeping its amplitude and speed as they were given. Example: "The camera pushes in with small amplitude at slow speed toward the folded letter in her hands."

Reproduce every dialogue line exactly as it was given, inside its <d> tags with its language tag, and introduce the speaker by the identity you were given for them: The elderly keeper with a low, weathered voice (S1) says: <d>[English] Almost there.</d>. Text visible on screen goes in double quotation marks, verbatim. Diegetic music, radio, television and phone audio belong in the prose, not in the other two fields.

A person, place or object that appears in more than one shot looks and sounds the same throughout, so carry the description you gave it into every later shot that shows it. Add scene, character and action detail that stays consistent with what you were given.

overall_soundscape is one paragraph of one to four sentences summarising ambient sound, physical action sounds and non-verbal human sounds across the whole clip: wind, rain, traffic, footsteps, fabric, impacts, breathing, laughter. Do not repeat dialogue, singing or diegetic music. Use "N/A" only when the clip is meant to be silent.

non_diegetic_music is one to three sentences describing music only the audience hears: instrumentation, tempo, rhythm and changes in dynamics. Do not use mood words or explain what the music is for. Use "N/A" when there is no score.`

/** MiniMax H3, text to video. The reference image forms arrive with the asset library. */
export const minimaxH3: PromptTarget = {
  id: "minimax-h3",
  name: "MiniMax H3",
  vocabularies: H3_VOCABULARIES,
  render: renderH3Prompt,
  brief: {
    systemPrompt: H3_SYSTEM_PROMPT,
    schema: H3_PROMPT_SCHEMA,
    userMessage: h3UserMessage,
    readFields,
  },
  prose: {
    systemPrompt: H3_PROSE_SYSTEM_PROMPT,
    schema: H3_PROSE_SCHEMA,
    instruction: proseInstruction,
    readProse,
    assemble,
    describeShot,
  },
}
