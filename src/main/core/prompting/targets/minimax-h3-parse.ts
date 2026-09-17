import { H3_VOCABULARIES } from "./minimax-h3"
import type { ParsedClip, ParsedLine, ParsedShot, ParsedSubject } from "../target"

/**
 * Reading a prompt back into a clip.
 *
 * Nothing the text held is thrown away. What the format marks is recognised and becomes structure;
 * everything else stays as a line of its own, which writes back out as the words it came in as. So
 * a prompt this app wrote comes back nearly whole, and one written by somebody else comes back as
 * shots of plain lines, which is a starting point rather than a refusal. Nothing is required: no
 * field labels, no shot markers, no cut times, and no word from any of the vocabularies.
 */

/** What the fields are called, in the order the prompt writes them. */
const FIELD_LABELS = [
  "integrated_multimodal_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const

/**
 * Text with the wrapping taken out of it. A prompt is hard-wrapped by whatever it was pasted
 * from, and those line breaks belong to the paste rather than to what it says.
 */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** What a field says when the clip gave it nothing, which is not something to read back. */
const NOTHING = "N/A"

/** How long a shot the text says nothing about runs for, which is what a new shot gets. */
const DEFAULT_SHOT_MS = 4000

/** The language a clip is in when no line of dialogue says otherwise. */
const DEFAULT_LANGUAGE = "English"

/** One span of dialogue as the prompt holds it, with whoever says it and what is true of it. */
interface Spoken {
  /** The phrase in front of the label, which is the speaker's name and how they sound. */
  introduction: string
  /** What stands between the label and the words, which is where a voice may be said. */
  after: string
  labels: string[]
  language: string
  text: string
  offScreen: boolean
  crossesCut: boolean
  cutOff: boolean
}

/** A run of the shot's text: either prose to split into lines, or one line somebody says. */
type Part = { prose: string } | { spoken: Spoken }

/** The fields of the prompt, and whatever stood in front of them. */
function splitFields(text: string): { fields: Map<string, string>; note: string } {
  const fields = new Map<string, string>()
  const found = FIELD_LABELS.map((label) => ({ label, at: text.indexOf(`${label}:`) })).filter(
    (entry) => entry.at !== -1
  )

  if (found.length === 0) {
    // Nothing names a field, so the whole of it is what the clip is made of.
    return { fields: new Map([[FIELD_LABELS[0], text.trim()]]), note: "" }
  }

  found.sort((one, other) => one.at - other.at)
  found.forEach((entry, index) => {
    const from = entry.at + entry.label.length + 1
    const to = index + 1 < found.length ? found[index + 1].at : text.length
    fields.set(entry.label, text.slice(from, to).trim())
  })
  return { fields, note: tidy(text.slice(0, found[0].at)) }
}

/** A field's text, or nothing when it holds nothing or says so. */
function fieldText(fields: Map<string, string>, label: string): string {
  const held = tidy(fields.get(label) ?? "")
  return held === NOTHING ? "" : held
}

/** The description split on its shot markers. A prompt with none of them is one shot. */
function splitShots(description: string): string[] {
  const marked = description.split(/\[Shot \d+\]/i)
  const shots = marked.map((part) => part.trim()).filter((part) => part.length > 0)
  return shots.length > 0 ? shots : [""]
}

/** How far into the clip a shot starts, from the cut time in front of it. */
function startOf(shot: string): { startMs: number | null; rest: string } {
  const at = /^At (\d+):(\d+)\.(\d+),\s*/.exec(shot)
  if (!at) return { startMs: null, rest: shot }
  const startMs = Number(at[1]) * 60_000 + Number(at[2]) * 1000 + Number(at[3])
  return { startMs, rest: shot.slice(at[0].length) }
}

/**
 * How long each shot runs, from where the next one starts. The first shot starts the clip, so it
 * carries no time of its own. The last has nothing after it to say where it ends, so it takes the
 * length a new shot takes.
 */
function lengths(starts: (number | null)[]): number[] {
  return starts.map((start, index) => {
    const from = index === 0 ? (start ?? 0) : start
    const next = starts[index + 1]
    if (from === null || next === null || next === undefined) return DEFAULT_SHOT_MS
    const ran = next - from
    return ran > 0 ? ran : DEFAULT_SHOT_MS
  })
}

/** Everything the prompt says about one spoken line, taken from around its tag. */
const SPOKEN = /<d>\[([^\]]*)\]\s*([\s\S]*?)<\/d>/g

/** What can follow a closing tag, which belongs to the line rather than to the shot. */
const AFTER_SPOKEN = /^\s*(?:<scenetrans>[^.]*\.|<cutoff>[^.]*\.|Their lips remain closed\.|\.)*\s*/

/**
 * Where the sentence holding a tag begins, which is after the last sentence that ended before it.
 * Any run of space counts, since a prompt is wrapped wherever it was pasted from.
 */
function sentenceStart(before: string): number {
  let at = 0
  for (const ended of before.matchAll(/[.!?]\s+/g)) {
    at = (ended.index ?? 0) + ended[0].length
  }
  return at
}

/** The shot's text as an ordered run of prose and spoken lines. */
function partsOf(text: string): Part[] {
  const parts: Part[] = []
  let from = 0

  for (const match of text.matchAll(SPOKEN)) {
    const at = match.index ?? 0
    const before = text.slice(from, at)
    // The speaker is introduced in the same sentence as the tag, so the sentence is the line.
    const opens = sentenceStart(before)
    const introduction = before.slice(opens).trim()
    const prose = before.slice(0, opens).trim()
    if (prose.length > 0) parts.push({ prose })

    const rest = text.slice(at + match[0].length)
    const trailing = AFTER_SPOKEN.exec(rest)?.[0] ?? ""
    parts.push({
      spoken: {
        introduction,
        after: introduction.replace(/^[\s\S]*\)/, ""),
        labels: [...introduction.matchAll(/\(([^)]*)\)/g)].flatMap((label) =>
          label[1].split(",").map((one) => one.trim())
        ),
        language: tidy(match[1]),
        text: tidy(match[2]),
        offScreen: /off-screen voiceover/i.test(introduction),
        crossesCut: trailing.includes("<scenetrans>"),
        cutOff: trailing.includes("<cutoff>"),
      },
    })
    from = at + match[0].length + trailing.length
  }

  const last = text.slice(from).trim()
  if (last.length > 0) parts.push({ prose: last })
  return parts
}

/** Prose split into sentences, each of which is a line. */
function sentences(prose: string): string[] {
  return prose
    .split(/(?<=[.!?])\s+/)
    .map(tidy)
    .filter((sentence) => sentence.length > 0)
}

/**
 * A speaker, from the phrase in front of their label. The first comma separates their name from
 * how they sound, which is how the prompt writes them. A phrase with no name is nobody.
 */
function subjectFromPhrase(phrase: string): ParsedSubject | null {
  const said = tidy(phrase)
  if (said.length === 0) return null
  const comma = said.indexOf(",")
  if (comma === -1) return { name: said, description: "", voice: null }
  return {
    name: tidy(said.slice(0, comma)),
    description: "",
    voice: tidy(said.slice(comma + 1)) || null,
  }
}

/** A label and the speakers it stands for, such as `S1` or the `S1,S2` two of them share. */
const LABELS = /\((S\d+(?:\s*,\s*S\d+)*)\)/g

/**
 * Every speaker label in the prompt, with whoever the text names them as. A label is read wherever
 * it is first used, not only where somebody says something, because a prompt may introduce
 * somebody in one sentence and then refer to them by their label alone in another.
 */
function speakersIn(description: string): Map<string, ParsedSubject> {
  const found = new Map<string, ParsedSubject>()
  for (const used of description.matchAll(LABELS)) {
    const labels = used[1].split(",").map((label) => label.trim())
    // A label two speakers share says nothing about which of them the phrase in front names.
    if (labels.length !== 1 || found.has(labels[0])) continue
    const before = description.slice(0, used.index ?? 0)
    const named = subjectFromPhrase(before.slice(sentenceStart(before)))
    if (named) found.set(labels[0], named)
  }
  return found
}

/**
 * How a speaker sounds, from whatever follows their label before they say anything. The prompt
 * writes the voice in front of the label, but a prompt from somewhere else may put it after.
 */
function voiceAfter(after: string): string | null {
  const said = tidy(after)
    .replace(/^says(\s+in\s+an\s+off-screen\s+voiceover)?/i, "")
    .replace(/[:,]\s*$/, "")
  return tidy(said) || null
}

/** A line of prose, said about one of the cast when it opens on a name the clip already knows. */
function proseLine(sentence: string, cast: ParsedSubject[]): ParsedLine {
  const plain: ParsedLine = {
    kind: "action",
    subject: null,
    text: sentence,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }

  const named = cast.find(
    (subject) => subject.name.length > 0 && sentence.startsWith(`${subject.name} `)
  )
  if (!named) return plain
  const rest = sentence.slice(named.name.length + 1).replace(/^,\s*/, "")
  return { ...plain, subject: named.name, text: rest }
}

/** Whether the first sentence of the first shot is the style, which is a word the target knows. */
function styleIn(sentence: string): boolean {
  const words = sentence.replace(/\.$/, "").split(/,\s*/)
  return words.length > 0 && words.every((word) => H3_VOCABULARIES.styles.includes(word.trim()))
}

/** A prompt read back into a clip. */
export function parseH3Prompt(text: string): ParsedClip {
  const { fields, note } = splitFields(text)
  const shotTexts = splitShots(fieldText(fields, FIELD_LABELS[0]))
  const starts = shotTexts.map((shot) => startOf(shot).startMs)
  const runs = lengths(starts)

  const cast: ParsedSubject[] = []
  const bySpeakerLabel = speakersIn(fieldText(fields, FIELD_LABELS[0]))
  let style = ""
  let language = ""

  const shots: ParsedShot[] = shotTexts.map((shotText, index) => {
    const { rest } = startOf(shotText)
    const lines: ParsedLine[] = []

    for (const part of partsOf(rest)) {
      if ("spoken" in part) {
        const speaker = part.spoken.labels
          .map((label) => bySpeakerLabel.get(label))
          .find((one) => one !== undefined)
        if (speaker) {
          // Some prompts say how somebody sounds after their label rather than in front of it.
          speaker.voice ??= voiceAfter(part.spoken.after)
          if (!cast.some((one) => one.name === speaker.name)) cast.push(speaker)
        }
        const says = speaker?.name
        if (language.length === 0) language = part.spoken.language
        lines.push({
          kind: "speech",
          subject: says ?? null,
          text: part.spoken.text,
          language: part.spoken.language,
          offScreen: part.spoken.offScreen,
          crossesCut: part.spoken.crossesCut,
          cutOff: part.spoken.cutOff,
        })
        continue
      }

      for (const sentence of sentences(part.prose)) {
        // The style opens the first shot, and is only taken as one when the target knows the word.
        if (index === 0 && lines.length === 0 && style.length === 0 && styleIn(sentence)) {
          style = sentence.replace(/\.$/, "")
          continue
        }
        lines.push(proseLine(sentence, cast))
      }
    }

    return { durationMs: runs[index], lines }
  })

  return {
    style,
    musicNote: fieldText(fields, FIELD_LABELS[2]),
    soundscape: fieldText(fields, FIELD_LABELS[1]),
    language: language.length > 0 ? language : DEFAULT_LANGUAGE,
    cast,
    shots,
    note,
  }
}
