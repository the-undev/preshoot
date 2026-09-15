import { and, asc, count, desc, eq, isNotNull, sum } from "drizzle-orm"
import { schema, type ProjectDatabase, type ProjectDb } from "../db"
import type { ClipComposition, ClipForm, FrameComposition, LineKind, ShotComposition } from "./clip"
import { CompositionError } from "./errors"

/** How long a new shot runs until the user says otherwise. */
const DEFAULT_SHOT_MS = 4000

/** A clip without its shots, for the list beside the editor. */
export interface ClipSummary {
  id: number
  /** The name it was saved under, or nothing while it is a scratch clip. */
  name: string | null
  /** The saved clip this one was branched from, for saying what it is based on. */
  savedFromId: number | null
  target: string
  style: string
  note: string
  musicNote: string
  form: ClipForm
  shortEdge: number
  aspectRatio: string
  /** What is spoken in this clip unless a line says otherwise. */
  language: string
  shots: number
  durationMs: number
  createdAt: string
}

/** Everything a shot holds, as the editor sends it back. */
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
export interface LineInput {
  kind: LineKind
  assetId: number | null
  speakerIds: number[]
  text: string
  language: string | null
  offScreen: boolean
  crossesCut: boolean
  cutOff: boolean
}

type ClipRow = typeof schema.clips.$inferSelect

/** The project's saved clips, newest first. A scratch clip is reached from its tab, not here. */
export function listClips(db: ProjectDatabase): ClipSummary[] {
  const shots = shotTotals(db)
  return db
    .select()
    .from(schema.clips)
    .where(isNotNull(schema.clips.name))
    .orderBy(desc(schema.clips.createdAt), desc(schema.clips.id))
    .all()
    .map((row) => toSummary(row, shots.get(row.id)))
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

/** One clip's own fields, without its shots. */
export function readClip(db: ProjectDatabase, clipId: number): ClipSummary {
  const row = db.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
  if (!row) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }
  return toSummary(row, shotTotals(db).get(row.id))
}

/** Starts a clip with no shots. */
export function insertClip(
  db: ProjectDatabase,
  input: { name: string | null; target: string; style: string }
): ClipSummary {
  const [row] = db
    .insert(schema.clips)
    .values({ ...input, note: "", musicNote: "", createdAt: new Date() })
    .returning()
    .all()
  return toSummary(row, undefined)
}

/** Rewrites the clip's own fields, leaving its shots and speakers alone. */
export function updateClip(
  db: ProjectDatabase,
  input: {
    id: number
    style: string
    note: string
    musicNote: string
    form: ClipForm
    shortEdge: number
    aspectRatio: string
    language: string
  }
): ClipSummary {
  const [row] = db
    .update(schema.clips)
    .set({
      style: input.style,
      note: input.note,
      musicNote: input.musicNote,
      form: input.form,
      shortEdge: input.shortEdge,
      aspectRatio: input.aspectRatio,
      language: input.language,
    })
    .where(eq(schema.clips.id, input.id))
    .returning()
    .all()
  if (!row) {
    throw CompositionError.notFound(`Clip ${input.id}`)
  }
  return toSummary(row, shotTotals(db).get(row.id))
}

/**
 * Copies a clip into a new scratch one and hands it back, so a version can be tried without
 * touching what it came from. A branch of a branch still points at the saved clip underneath, so
 * the trail is one step long rather than a history to walk.
 */
export function branchClip(db: ProjectDatabase, clipId: number): ClipSummary {
  return db.transaction((tx) => {
    const source = tx.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
    if (!source) {
      throw CompositionError.notFound(`Clip ${clipId}`)
    }

    const branch = tx
      .insert(schema.clips)
      .values({
        ...source,
        id: undefined,
        name: null,
        savedFromId: source.name === null ? source.savedFromId : source.id,
        createdAt: new Date(),
      })
      .returning()
      .get()

    // A line of dialogue names its speakers by id, so the copies have to be renumbered to match.
    const speakers = new Map<number, number>()
    for (const speaker of tx
      .select()
      .from(schema.speakers)
      .where(eq(schema.speakers.clipId, clipId))
      .all()) {
      const copy = tx
        .insert(schema.speakers)
        .values({ ...speaker, id: undefined, clipId: branch.id })
        .returning()
        .get()
      speakers.set(speaker.id, copy.id)
    }

    for (const frame of tx
      .select()
      .from(schema.clipFrames)
      .where(eq(schema.clipFrames.clipId, clipId))
      .all()) {
      tx.insert(schema.clipFrames)
        .values({ ...frame, id: undefined, clipId: branch.id })
        .run()
    }

    for (const shot of tx
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.clipId, clipId))
      .all()) {
      const copy = tx
        .insert(schema.shots)
        .values({ ...shot, id: undefined, clipId: branch.id })
        .returning()
        .get()
      copyShotContents(tx, shot.id, copy.id, speakers)
    }

    return toSummary(branch, shotTotals(db).get(branch.id))
  })
}

/** Everything hanging off one shot, copied onto another, with the speakers renumbered. */
function copyShotContents(
  tx: ProjectDb,
  shotId: number,
  toShotId: number,
  speakers: Map<number, number>
): void {
  for (const thing of tx
    .select()
    .from(schema.shotAssets)
    .where(eq(schema.shotAssets.shotId, shotId))
    .all()) {
    tx.insert(schema.shotAssets)
      .values({ ...thing, shotId: toShotId })
      .run()
  }

  for (const line of tx
    .select()
    .from(schema.shotLines)
    .where(eq(schema.shotLines.shotId, shotId))
    .all()) {
    tx.insert(schema.shotLines)
      .values({
        ...line,
        id: undefined,
        shotId: toShotId,
        speakerIds: line.speakerIds.map((id) => speakers.get(id) ?? id),
      })
      .run()
  }
}

/** Saves a scratch clip under a name, which is what puts it in the project's list of clips. */
export function saveClip(db: ProjectDatabase, clipId: number, name: string): ClipSummary {
  const [row] = db
    .update(schema.clips)
    .set({ name })
    .where(eq(schema.clips.id, clipId))
    .returning()
    .all()
  if (!row) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }
  return toSummary(row, shotTotals(db).get(row.id))
}

/** Whether a clip has been saved, which decides whether closing its tab throws it away. */
export function isScratchClip(db: ProjectDatabase, clipId: number): boolean {
  const clip = db.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
  return clip !== undefined && clip.name === null
}

/** Removes a clip and everything under it. */
export function deleteClip(db: ProjectDatabase, clipId: number): void {
  const removed = db.delete(schema.clips).where(eq(schema.clips.id, clipId)).returning().all()
  if (removed.length === 0) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }
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

  const lineRows = db
    .select({
      id: schema.shotLines.id,
      shotId: schema.shotLines.shotId,
      kind: schema.shotLines.kind,
      assetId: schema.shotLines.assetId,
      subjectName: schema.assets.name,
      speakerIds: schema.shotLines.speakerIds,
      text: schema.shotLines.text,
      language: schema.shotLines.language,
      offScreen: schema.shotLines.offScreen,
      crossesCut: schema.shotLines.crossesCut,
      cutOff: schema.shotLines.cutOff,
    })
    .from(schema.shotLines)
    .innerJoin(schema.shots, eq(schema.shots.id, schema.shotLines.shotId))
    .leftJoin(schema.assets, eq(schema.assets.id, schema.shotLines.assetId))
    .where(eq(schema.shots.clipId, clipId))
    .orderBy(asc(schema.shotLines.position), asc(schema.shotLines.id))
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
    lines: lineRows
      .filter((line) => line.shotId === shot.id)
      .map((line) => ({
        id: line.id,
        kind: line.kind as LineKind,
        assetId: line.assetId,
        subjectName: line.subjectName,
        speakerIds: line.speakerIds,
        text: line.text,
        language: line.language,
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
    frames: readFrames(db, clipId),
    language: clip.language,
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
export function setShotLines(db: ProjectDatabase, shotId: number, lines: LineInput[]): void {
  clipOfShot(db, shotId)
  db.transaction((tx) => {
    tx.delete(schema.shotLines).where(eq(schema.shotLines.shotId, shotId)).run()
    lines.forEach((line, position) => {
      tx.insert(schema.shotLines)
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
    for (const line of tx.select().from(schema.shotLines).all()) {
      if (!line.speakerIds.includes(speakerId)) continue
      const left = line.speakerIds.filter((id) => id !== speakerId)
      if (left.length === 0) {
        tx.delete(schema.shotLines).where(eq(schema.shotLines.id, line.id)).run()
      } else {
        tx.update(schema.shotLines)
          .set({ speakerIds: left })
          .where(eq(schema.shotLines.id, line.id))
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
  shots: { shots: number; durationMs: number } | undefined
): ClipSummary {
  return {
    ...row,
    form: row.form as ClipForm,
    shots: shots?.shots ?? 0,
    durationMs: shots?.durationMs ?? 0,
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
