import { and, asc, count, desc, eq, sum } from "drizzle-orm"
import { schema, type ProjectDatabase, type ProjectDb } from "../db"
import type { ClipComposition, ClipForm, FrameComposition, ShotComposition } from "./clip"
import { CompositionError } from "./errors"

/** How long a new shot runs until the user says otherwise. */
const DEFAULT_SHOT_MS = 4000

/** A clip without its shots, for the list beside the editor. */
export interface ClipSummary {
  id: number
  name: string
  target: string
  style: string
  note: string
  musicNote: string
  form: ClipForm
  shortEdge: number
  aspectRatio: string
  seed: number
  shots: number
  durationMs: number
  prompts: number
  createdAt: string
}

/** Everything a shot holds, as the editor sends it back. */
/** One beat as the editor sends it back. */
export interface BeatInput {
  assetId: number | null
  text: string
}

export interface ShotInput {
  id: number
  durationMs: number
  cameraMotion: string | null
  amplitude: string | null
  speed: string | null
  transition: string | null
  lighting: string | null
  soundNote: string
}

/** One line as the editor sends it back. */
export interface DialogueInput {
  speakerIds: number[]
  language: string
  text: string
  offScreen: boolean
  crossesCut: boolean
  cutOff: boolean
}

type ClipRow = typeof schema.clips.$inferSelect

/** Every clip in the project, newest first. */
export function listClips(db: ProjectDatabase): ClipSummary[] {
  const prompts = promptCounts(db)
  const shots = shotTotals(db)
  return db
    .select()
    .from(schema.clips)
    .orderBy(desc(schema.clips.createdAt), desc(schema.clips.id))
    .all()
    .map((row) => toSummary(row, prompts.get(row.id) ?? 0, shots.get(row.id)))
}

/** How many shots each clip has and how long they run to. */
function shotTotals(db: ProjectDatabase): Map<number, { shots: number; durationMs: number }> {
  const rows = db
    .select({
      clipId: schema.shots.clipId,
      shots: count(),
      durationMs: sum(schema.shots.durationMs),
    })
    .from(schema.shots)
    .groupBy(schema.shots.clipId)
    .all()
  return new Map(
    rows.map((row) => [row.clipId, { shots: row.shots, durationMs: Number(row.durationMs ?? 0) }])
  )
}

/** How many prompts have been generated for each clip. */
function promptCounts(db: ProjectDatabase): Map<number, number> {
  const rows = db
    .select({ clipId: schema.generations.clipId, written: count() })
    .from(schema.generations)
    .groupBy(schema.generations.clipId)
    .all()
  return new Map(
    rows.filter((row) => row.clipId !== null).map((row) => [row.clipId as number, row.written])
  )
}

/** One clip's own fields, without its shots. */
export function readClip(db: ProjectDatabase, clipId: number): ClipSummary {
  const row = db.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
  if (!row) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }
  return toSummary(row, promptCounts(db).get(row.id) ?? 0, shotTotals(db).get(row.id))
}

/** Starts a clip with no shots. */
export function insertClip(
  db: ProjectDatabase,
  input: { name: string; target: string; style: string }
): ClipSummary {
  const [row] = db
    .insert(schema.clips)
    .values({ ...input, note: "", musicNote: "", createdAt: new Date() })
    .returning()
    .all()
  return toSummary(row, 0, undefined)
}

/** Rewrites the clip's own fields, leaving its shots and speakers alone. */
export function updateClip(
  db: ProjectDatabase,
  input: {
    id: number
    name: string
    style: string
    note: string
    musicNote: string
    form: ClipForm
    shortEdge: number
    aspectRatio: string
    seed: number
  }
): ClipSummary {
  const [row] = db
    .update(schema.clips)
    .set({
      name: input.name,
      style: input.style,
      note: input.note,
      musicNote: input.musicNote,
      form: input.form,
      shortEdge: input.shortEdge,
      aspectRatio: input.aspectRatio,
      seed: input.seed,
    })
    .where(eq(schema.clips.id, input.id))
    .returning()
    .all()
  if (!row) {
    throw CompositionError.notFound(`Clip ${input.id}`)
  }
  return toSummary(row, promptCounts(db).get(row.id) ?? 0, shotTotals(db).get(row.id))
}

/**
 * Removes a clip and everything under it, prompts included. Left behind, a prompt would have no
 * clip to be read under, so it would be unreachable rather than kept.
 */
export function deleteClip(db: ProjectDatabase, clipId: number): number {
  return db.transaction((tx) => {
    const prompts = tx
      .delete(schema.generations)
      .where(eq(schema.generations.clipId, clipId))
      .returning()
      .all()
    const removed = tx.delete(schema.clips).where(eq(schema.clips.id, clipId)).returning().all()
    if (removed.length === 0) {
      throw CompositionError.notFound(`Clip ${clipId}`)
    }
    return prompts.length
  })
}

/** The whole clip, with its speakers, shots, the things they show and what is said. */
export function readComposition(db: ProjectDatabase, clipId: number): ClipComposition {
  const clip = db.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
  if (!clip) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }

  const speakerRows = db
    .select({
      id: schema.speakers.id,
      position: schema.speakers.position,
      description: schema.speakers.description,
      subjectName: schema.assets.name,
      subjectDescription: schema.assets.description,
    })
    .from(schema.speakers)
    .leftJoin(schema.assets, eq(schema.assets.id, schema.speakers.assetId))
    .where(eq(schema.speakers.clipId, clipId))
    .orderBy(asc(schema.speakers.position))
    .all()

  const shotRows = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.clipId, clipId))
    .orderBy(asc(schema.shots.position))
    .all()

  const thingRows = db
    .select({
      shotId: schema.shotAssets.shotId,
      id: schema.assets.id,
      kind: schema.assets.kind,
      name: schema.assets.name,
      description: schema.assets.description,
    })
    .from(schema.shotAssets)
    .innerJoin(schema.shots, eq(schema.shots.id, schema.shotAssets.shotId))
    .innerJoin(schema.assets, eq(schema.assets.id, schema.shotAssets.assetId))
    .where(eq(schema.shots.clipId, clipId))
    .orderBy(asc(schema.shotAssets.position))
    .all()

  const beatRows = db
    .select({
      shotId: schema.shotBeats.shotId,
      subjectName: schema.assets.name,
      text: schema.shotBeats.text,
    })
    .from(schema.shotBeats)
    .innerJoin(schema.shots, eq(schema.shots.id, schema.shotBeats.shotId))
    .leftJoin(schema.assets, eq(schema.assets.id, schema.shotBeats.assetId))
    .where(eq(schema.shots.clipId, clipId))
    .orderBy(asc(schema.shotBeats.position), asc(schema.shotBeats.id))
    .all()

  const dialogueRows = db
    .select({
      shotId: schema.dialogueLines.shotId,
      speakerIds: schema.dialogueLines.speakerIds,
      language: schema.dialogueLines.language,
      text: schema.dialogueLines.text,
      offScreen: schema.dialogueLines.offScreen,
      crossesCut: schema.dialogueLines.crossesCut,
      cutOff: schema.dialogueLines.cutOff,
    })
    .from(schema.dialogueLines)
    .innerJoin(schema.shots, eq(schema.shots.id, schema.dialogueLines.shotId))
    .where(eq(schema.shots.clipId, clipId))
    .orderBy(asc(schema.dialogueLines.position))
    .all()

  const shots: ShotComposition[] = shotRows.map((shot) => ({
    id: shot.id,
    durationMs: shot.durationMs,
    cameraMotion: shot.cameraMotion,
    amplitude: shot.amplitude,
    speed: shot.speed,
    transition: shot.transition,
    lighting: shot.lighting,
    things: thingRows
      .filter((thing) => thing.shotId === shot.id)
      .map(({ id, kind, name, description }) => ({ id, kind, name, description })),
    beats: beatRows
      .filter((beat) => beat.shotId === shot.id)
      .map(({ subjectName, text }) => ({ subjectName, text })),
    dialogue: dialogueRows
      .filter((line) => line.shotId === shot.id)
      .map((line) => ({
        speakerIds: line.speakerIds,
        language: line.language,
        text: line.text,
        offScreen: line.offScreen,
        crossesCut: line.crossesCut,
        cutOff: line.cutOff,
      })),
    soundNote: shot.soundNote,
  }))

  return {
    id: clip.id,
    name: clip.name,
    form: clip.form as ClipForm,
    shortEdge: clip.shortEdge,
    aspectRatio: clip.aspectRatio,
    seed: clip.seed,
    frames: readFrames(db, clipId),
    style: clip.style,
    note: clip.note,
    musicNote: clip.musicNote,
    speakers: speakerRows.map((speaker) => ({
      id: speaker.id,
      label: speakerLabel(speaker.position),
      // A voice that is a subject is described by that subject, so the two cannot drift apart.
      description: speaker.subjectDescription ?? speaker.description,
      subjectName: speaker.subjectName,
    })),
    shots,
  }
}

/** The pictures this clip is anchored to, with the library thing each came from. */
function readFrames(db: ProjectDb, clipId: number): FrameComposition[] {
  return db
    .select({
      role: schema.clipFrames.role,
      imageId: schema.clipFrames.imageId,
      fileName: schema.assetImages.fileName,
      mediaType: schema.assetImages.mediaType,
      assetName: schema.assets.name,
    })
    .from(schema.clipFrames)
    .innerJoin(schema.assetImages, eq(schema.assetImages.id, schema.clipFrames.imageId))
    .innerJoin(schema.assets, eq(schema.assets.id, schema.assetImages.assetId))
    .where(eq(schema.clipFrames.clipId, clipId))
    .all()
    .map((row) => ({ ...row, role: row.role as FrameComposition["role"] }))
}

/** Anchors one end of the clip to a picture, replacing whatever was there. */
export function setClipFrame(
  db: ProjectDatabase,
  input: { clipId: number; role: FrameComposition["role"]; imageId: number }
): void {
  readClip(db, input.clipId)
  db.transaction((tx) => {
    tx.delete(schema.clipFrames)
      .where(
        and(eq(schema.clipFrames.clipId, input.clipId), eq(schema.clipFrames.role, input.role))
      )
      .run()
    tx.insert(schema.clipFrames).values(input).run()
  })
}

/** Takes the picture off one end of the clip. */
export function clearClipFrame(
  db: ProjectDatabase,
  input: { clipId: number; role: FrameComposition["role"] }
): void {
  db.delete(schema.clipFrames)
    .where(and(eq(schema.clipFrames.clipId, input.clipId), eq(schema.clipFrames.role, input.role)))
    .run()
}

/** Adds an empty shot at the end of the clip. */
export function insertShot(db: ProjectDatabase, clipId: number): number {
  const clip = db.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
  if (!clip) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }

  const [row] = db
    .insert(schema.shots)
    .values({
      clipId,
      position: shotIdsInOrder(db, clipId).length,
      durationMs: DEFAULT_SHOT_MS,
      cameraMotion: null,
      amplitude: null,
      speed: null,
      transition: null,
      lighting: null,
      action: "",
      soundNote: "",
    })
    .returning()
    .all()
  return row.id
}

/** Rewrites one shot's own fields. */
export function updateShot(db: ProjectDatabase, input: ShotInput): void {
  const changed = db
    .update(schema.shots)
    .set({
      durationMs: input.durationMs,
      cameraMotion: input.cameraMotion,
      amplitude: input.amplitude,
      speed: input.speed,
      transition: input.transition,
      lighting: input.lighting,
      soundNote: input.soundNote,
    })
    .where(eq(schema.shots.id, input.id))
    .returning()
    .all()
  if (changed.length === 0) {
    throw CompositionError.notFound(`Shot ${input.id}`)
  }
}

/** Removes a shot and closes the gap it leaves. */
export function deleteShot(db: ProjectDatabase, shotId: number): void {
  const clipId = clipOfShot(db, shotId)
  db.transaction((tx) => {
    tx.delete(schema.shots).where(eq(schema.shots.id, shotId)).run()
    renumberShots(tx, clipId)
  })
}

/** Puts a shot at `toPosition`, sliding the others around it. */
export function moveShot(db: ProjectDatabase, shotId: number, toPosition: number): void {
  const clipId = clipOfShot(db, shotId)
  const ids = shotIdsInOrder(db, clipId).filter((id) => id !== shotId)
  const target = Math.min(Math.max(toPosition, 0), ids.length)
  ids.splice(target, 0, shotId)

  db.transaction((tx) => {
    ids.forEach((id, position) => {
      tx.update(schema.shots).set({ position }).where(eq(schema.shots.id, id)).run()
    })
  })
}

/** Replaces the library things a shot shows, in the order given. */
export function setShotThings(db: ProjectDatabase, shotId: number, assetIds: number[]): void {
  clipOfShot(db, shotId)
  db.transaction((tx) => {
    tx.delete(schema.shotAssets).where(eq(schema.shotAssets.shotId, shotId)).run()
    assetIds.forEach((assetId, position) => {
      tx.insert(schema.shotAssets).values({ shotId, assetId, position }).run()
    })
  })
}

/** Replaces what happens in a shot, in the order given. */
export function setShotBeats(db: ProjectDatabase, shotId: number, beats: BeatInput[]): void {
  clipOfShot(db, shotId)
  db.transaction((tx) => {
    tx.delete(schema.shotBeats).where(eq(schema.shotBeats.shotId, shotId)).run()
    beats.forEach((beat, position) => {
      tx.insert(schema.shotBeats)
        .values({ shotId, position, ...beat })
        .run()
    })
  })
}

/** Replaces what is said in a shot, in the order given. */
export function setShotDialogue(db: ProjectDatabase, shotId: number, lines: DialogueInput[]): void {
  clipOfShot(db, shotId)
  db.transaction((tx) => {
    tx.delete(schema.dialogueLines).where(eq(schema.dialogueLines.shotId, shotId)).run()
    lines.forEach((line, position) => {
      tx.insert(schema.dialogueLines)
        .values({ shotId, position, ...line })
        .run()
    })
  })
}

/** Adds a voice to the clip. Its label follows from its place in the list. */
export function insertSpeaker(
  db: ProjectDatabase,
  clipId: number,
  input: { assetId: number | null; description: string }
): number {
  const clip = db.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
  if (!clip) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }

  const [row] = db
    .insert(schema.speakers)
    .values({
      clipId,
      position: speakerIdsInOrder(db, clipId).length,
      assetId: input.assetId,
      description: input.description,
    })
    .returning()
    .all()
  return row.id
}

/** Rewrites a voice: which subject it belongs to, or how it is described on its own. */
export function updateSpeaker(
  db: ProjectDatabase,
  speakerId: number,
  input: { assetId: number | null; description: string }
): void {
  const changed = db
    .update(schema.speakers)
    .set({ assetId: input.assetId, description: input.description })
    .where(eq(schema.speakers.id, speakerId))
    .returning()
    .all()
  if (changed.length === 0) {
    throw CompositionError.notFound(`Speaker ${speakerId}`)
  }
}

/**
 * Removes a voice, takes it out of everything it shared a line with, and drops the lines it was
 * the only speaker of. Nothing points at speakers any more, so no key does this for us.
 */
export function deleteSpeaker(db: ProjectDatabase, speakerId: number): void {
  const speaker = db.select().from(schema.speakers).where(eq(schema.speakers.id, speakerId)).get()
  if (!speaker) {
    throw CompositionError.notFound(`Speaker ${speakerId}`)
  }

  db.transaction((tx) => {
    for (const line of tx.select().from(schema.dialogueLines).all()) {
      if (!line.speakerIds.includes(speakerId)) continue
      const left = line.speakerIds.filter((id) => id !== speakerId)
      if (left.length === 0) {
        tx.delete(schema.dialogueLines).where(eq(schema.dialogueLines.id, line.id)).run()
      } else {
        tx.update(schema.dialogueLines)
          .set({ speakerIds: left })
          .where(eq(schema.dialogueLines.id, line.id))
          .run()
      }
    }
    tx.delete(schema.speakers).where(eq(schema.speakers.id, speakerId)).run()
    speakerIdsInOrder(tx, speaker.clipId).forEach((id, position) => {
      tx.update(schema.speakers).set({ position }).where(eq(schema.speakers.id, id)).run()
    })
  })
}

/** Which clip a shot belongs to. */
export function clipIdOfShot(db: ProjectDatabase, shotId: number): number {
  return clipOfShot(db, shotId)
}

/** Which clip a speaker belongs to. */
export function clipIdOfSpeaker(db: ProjectDatabase, speakerId: number): number {
  const speaker = db.select().from(schema.speakers).where(eq(schema.speakers.id, speakerId)).get()
  if (!speaker) {
    throw CompositionError.notFound(`Speaker ${speakerId}`)
  }
  return speaker.clipId
}

/** What the prompt calls the speaker sitting at `position`. */
export function speakerLabel(position: number): string {
  return `S${position + 1}`
}

function toSummary(
  row: ClipRow,
  prompts: number,
  shots: { shots: number; durationMs: number } | undefined
): ClipSummary {
  return {
    ...row,
    form: row.form as ClipForm,
    shots: shots?.shots ?? 0,
    durationMs: shots?.durationMs ?? 0,
    prompts,
    createdAt: row.createdAt.toISOString(),
  }
}

function clipOfShot(db: ProjectDb, shotId: number): number {
  const shot = db.select().from(schema.shots).where(eq(schema.shots.id, shotId)).get()
  if (!shot) {
    throw CompositionError.notFound(`Shot ${shotId}`)
  }
  return shot.clipId
}

function shotIdsInOrder(db: ProjectDb, clipId: number): number[] {
  return db
    .select({ id: schema.shots.id })
    .from(schema.shots)
    .where(eq(schema.shots.clipId, clipId))
    .orderBy(asc(schema.shots.position), asc(schema.shots.id))
    .all()
    .map((row) => row.id)
}

function speakerIdsInOrder(db: ProjectDb, clipId: number): number[] {
  return db
    .select({ id: schema.speakers.id })
    .from(schema.speakers)
    .where(eq(schema.speakers.clipId, clipId))
    .orderBy(asc(schema.speakers.position), asc(schema.speakers.id))
    .all()
    .map((row) => row.id)
}

function renumberShots(db: ProjectDb, clipId: number): void {
  shotIdsInOrder(db, clipId).forEach((id, position) => {
    db.update(schema.shots).set({ position }).where(eq(schema.shots.id, id)).run()
  })
}
