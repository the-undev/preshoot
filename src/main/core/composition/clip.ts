/** How long a clip may run before the target model stops being able to hold it. */
export const MAX_CLIP_MS = 15_000

/**
 * One of the people, places or objects a clip refers to. It belongs to the clip, so changing it
 * here changes nothing anywhere else.
 */
export interface SubjectComposition {
  id: number
  kind: string
  name: string
  description: string
  /** How they sound, which the prompt needs to fix a voice. Nothing until they say something. */
  voice: string | null
}

/** What a line of a shot is: something the shot shows, something someone does, or something said. */
export type LineKind = "shows" | "action" | "speech"

/** Every kind, for the menu and for what the router will accept. */
export const LINE_KINDS: LineKind[] = ["shows", "action", "speech"]

/**
 * One line of a shot. A `shows` line names a subject the shot puts on screen, and its text adds
 * whatever is true of it here. An action belongs to one of the clip's subjects or to nobody in
 * particular, which means the scene. Speech is kept verbatim because the target reproduces it word
 * for word, and can be shared by several speakers, spoken off screen, carried across the cut that
 * follows it, or cut off by the end of the clip.
 */
export interface LineComposition {
  id: number
  kind: LineKind
  /** Who it is about: nobody for the scene, one to show or to act, one or more to speak. */
  subjectIds: number[]
  text: string
  /** Nothing unless this line is spoken in another language than the rest of the clip. */
  language: string | null
  offScreen: boolean
  crossesCut: boolean
  cutOff: boolean
}

/**
 * One shot: how long it lasts, how it is shot, and its lines, which are everything it shows, does
 * and says in the order they were written. The motion, amplitude, speed, transition and lighting
 * hold values from the target's vocabularies. What is heard belongs to the clip, not to a shot,
 * because the target has one field for it and nothing can say which shot a sound came from.
 */
export interface ShotComposition {
  id: number
  durationMs: number
  cameraMotion: string | null
  amplitude: string | null
  speed: string | null
  transition: string | null
  lighting: string | null
  lines: LineComposition[]
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
  /** Everything heard in the clip that nobody says. */
  soundscape: string
  /** What is spoken in this clip unless a line says otherwise. */
  language: string
  /** The people, places and objects this clip holds, which its shots and lines pick from. */
  cast: SubjectComposition[]
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

/** One of the clip's subjects by id, for naming it in the prompt. */
export function subjectOf(
  composition: ClipComposition,
  subjectId: number
): SubjectComposition | null {
  return composition.cast.find((subject) => subject.id === subjectId) ?? null
}

/**
 * The subjects that speak, in the order they first do, which is what gives them (S1), (S2) and so
 * on. Derived rather than stored, so nothing has to be renumbered when a line moves.
 */
export function speakingOrder(composition: ClipComposition): number[] {
  const order: number[] = []
  for (const shot of composition.shots) {
    for (const line of shot.lines) {
      if (line.kind !== "speech" || line.text.trim().length === 0) continue
      for (const id of line.subjectIds) {
        if (!order.includes(id)) order.push(id)
      }
    }
  }
  return order
}

/** The subjects a shot names, in the order its lines first name them. */
export function subjectIdsOf(shot: ShotComposition): number[] {
  const named: number[] = []
  for (const line of shot.lines) {
    for (const id of line.subjectIds) {
      if (!named.includes(id)) named.push(id)
    }
  }
  return named
}

/** What the prompt calls a subject that speaks, such as `S1`. */
export function speakerLabelOf(composition: ClipComposition, subjectId: number): string | null {
  const at = speakingOrder(composition).indexOf(subjectId)
  return at === -1 ? null : `S${at + 1}`
}
