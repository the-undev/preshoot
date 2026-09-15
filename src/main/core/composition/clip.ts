/** How long a clip may run before the target model stops being able to hold it. */
export const MAX_CLIP_MS = 15_000

/** One thing a shot shows, copied from the library so a stored composition stands on its own. */
export interface ThingComposition {
  id: number
  kind: string
  name: string
  description: string
}

/**
 * A voice in the clip. The label is what the prompt calls it, such as "S1". A voice that belongs
 * to one of the clip's subjects carries its name, so the prompt can say they are the same person.
 */
export interface SpeakerComposition {
  id: number
  label: string
  description: string
  subjectName: string | null
}

/** What a line of a shot is: something someone does, or something someone says. */
export type LineKind = "action" | "speech"

/** Both kinds, for the picker and for what the router will accept. */
export const LINE_KINDS: LineKind[] = ["action", "speech"]

/**
 * One thing that happens in a shot. An action belongs to one of the shot's subjects or to nobody
 * in particular, which means the scene. Speech is kept verbatim because the target reproduces it
 * word for word, and can be shared by several speakers, spoken off screen, carried across the cut
 * that follows it, or cut off by the end of the clip.
 */
export interface LineComposition {
  id: number
  kind: LineKind
  assetId: number | null
  subjectName: string | null
  speakerIds: number[]
  text: string
  /** Nothing unless this line is spoken in another language than the rest of the clip. */
  language: string | null
  offScreen: boolean
  crossesCut: boolean
  cutOff: boolean
}

/**
 * One shot: how long it lasts, how it is shot, what it shows, what happens in it and what is
 * said. The motion, amplitude, speed, transition and lighting hold values from the target's
 * vocabularies.
 */
export interface ShotComposition {
  id: number
  durationMs: number
  cameraMotion: string | null
  amplitude: string | null
  speed: string | null
  transition: string | null
  lighting: string | null
  things: ThingComposition[]
  lines: LineComposition[]
  soundNote: string
}

/** Which of the target's forms a clip is written for. */
export type ClipForm = "t2v" | "i2v" | "fl2v" | "l2v"

/** Every form, for the picker and for what the router will accept. */
export const CLIP_FORMS: ClipForm[] = ["t2v", "i2v", "fl2v", "l2v"]

/** A picture a clip is anchored to, copied out of the library so a stored composition stands alone. */
export interface FrameComposition {
  role: "first" | "last"
  imageId: number
  fileName: string
  mediaType: string
  assetName: string
}

/** A clip as the composers see it. Knows nothing of any target, model or database. */
export interface ClipComposition {
  id: number
  /** The name it was saved under, or nothing while it is a scratch clip. */
  name: string | null
  form: ClipForm
  shortEdge: number
  aspectRatio: string
  frames: FrameComposition[]
  style: string
  note: string
  musicNote: string
  /** What is spoken in this clip unless a line says otherwise. */
  language: string
  speakers: SpeakerComposition[]
  shots: ShotComposition[]
}

/** How long the whole clip runs. */
export function clipDurationMs(composition: ClipComposition): number {
  return composition.shots.reduce((total, shot) => total + shot.durationMs, 0)
}

/** The picture anchoring one end of the clip, or nothing when it has none. */
export function frameOf(
  composition: ClipComposition,
  role: FrameComposition["role"]
): FrameComposition | null {
  return composition.frames.find((frame) => frame.role === role) ?? null
}

/** When a shot starts, which is where its cut goes. The first shot starts at zero. */
export function shotStartMs(composition: ClipComposition, shotId: number): number {
  let start = 0
  for (const shot of composition.shots) {
    if (shot.id === shotId) return start
    start += shot.durationMs
  }
  throw new Error(`Shot ${shotId} is not in clip ${composition.id}`)
}

/** The speaker of a line, for naming it in an instruction. */
export function speakerOf(
  composition: ClipComposition,
  speakerId: number
): SpeakerComposition | null {
  return composition.speakers.find((speaker) => speaker.id === speakerId) ?? null
}
