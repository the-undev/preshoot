import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sum } from "drizzle-orm"
import { schema, type ProjectDatabase, type ProjectDb } from "../db"
import type { ClipComposition, ClipForm, FrameComposition, LineKind, ShotComposition } from "./clip"
import { listCast } from "./asset-store"
import { deleteImagesOfAsset } from "./image-store"
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
  subjectIds: number[]
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
    .where(isNotNull(schema.shots.clipId))
    .groupBy(schema.shots.clipId)
    .all()
  return new Map(
    rows.map((row) => [
      row.clipId as number,
      { shots: row.shots, durationMs: Number(row.durationMs ?? 0) },
    ])
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

/** Rewrites the clip's own fields, leaving its cast and its shots alone. */
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

    // The cast belongs to the clip, so the branch gets its own, and everything naming one is
    // renumbered to match: a line by id, and the list of what each shot shows by key.
    const subjects = new Map<number, number>()
    for (const subject of tx
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.clipId, clipId))
      .all()) {
      const copy = tx
        .insert(schema.assets)
        .values({ ...subject, id: undefined, clipId: branch.id })
        .returning()
        .get()
      subjects.set(subject.id, copy.id)

      for (const picture of tx
        .select()
        .from(schema.assetImages)
        .where(eq(schema.assetImages.assetId, subject.id))
        .all()) {
        tx.insert(schema.assetImages)
          .values({ ...picture, id: undefined, assetId: copy.id })
          .run()
      }
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
      copyShotContents(tx, shot.id, copy.id, subjects)
    }

    return toSummary(branch, shotTotals(db).get(branch.id))
  })
}

/** Everything hanging off one shot, copied onto another, with the subjects renumbered. */
function copyShotContents(
  tx: ProjectDb,
  shotId: number,
  toShotId: number,
  subjects: Map<number, number>
): void {
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
        subjectIds: line.subjectIds.map((id) => subjects.get(id) ?? id),
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

/** Removes a clip and everything under it, its cast and their pictures included. */
export function deleteClip(db: ProjectDatabase, directory: string, clipId: number): void {
  for (const subject of listCast(db, clipId)) {
    deleteImagesOfAsset(db, directory, subject.id)
  }
  db.transaction((tx) => {
    tx.delete(schema.assets).where(eq(schema.assets.clipId, clipId)).run()
    const removed = tx.delete(schema.clips).where(eq(schema.clips.id, clipId)).returning().all()
    if (removed.length === 0) {
      throw CompositionError.notFound(`Clip ${clipId}`)
    }
  })
}

/** The whole clip: its cast, its shots, what they show and what happens in them. */
export function readComposition(db: ProjectDatabase, clipId: number): ClipComposition {
  const clip = db.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
  if (!clip) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }

  const shotRows = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.clipId, clipId))
    .orderBy(asc(schema.shots.position))
    .all()

  const lineRows = db
    .select({
      id: schema.shotLines.id,
      shotId: schema.shotLines.shotId,
      kind: schema.shotLines.kind,
      subjectIds: schema.shotLines.subjectIds,
      text: schema.shotLines.text,
      language: schema.shotLines.language,
      offScreen: schema.shotLines.offScreen,
      crossesCut: schema.shotLines.crossesCut,
      cutOff: schema.shotLines.cutOff,
    })
    .from(schema.shotLines)
    .innerJoin(schema.shots, eq(schema.shots.id, schema.shotLines.shotId))
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
    lines: lineRows
      .filter((line) => line.shotId === shot.id)
      .map((line) => ({
        id: line.id,
        kind: line.kind as LineKind,
        subjectIds: line.subjectIds,
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
    cast: listCast(db, clipId).map(({ id, kind, name, description, voice }) => ({
      id,
      kind,
      name,
      description,
      voice,
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

  // A shot opens with a line to type into, so there is somewhere to write and somewhere to put
  // the cursor. An empty line is not written into the prompt.
  db.insert(schema.shotLines)
    .values({ shotId: row.id, position: 0, kind: "action", subjectIds: [], text: "" })
    .run()
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

/** The clip a subject belongs to, for answering with the whole clip after changing one of them. */
export function clipIdOfSubject(db: ProjectDatabase, subjectId: number): number {
  const subject = db.select().from(schema.assets).where(eq(schema.assets.id, subjectId)).get()
  if (!subject || subject.clipId === null) {
    throw CompositionError.notFound(`Subject ${subjectId}`)
  }
  return subject.clipId
}

/** The clip a shot belongs to, for answering with the whole clip after changing one of its parts. */
export function clipIdOfShot(db: ProjectDatabase, shotId: number): number {
  return clipOfShot(db, shotId)
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
  if (!shot || shot.clipId === null) {
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

function renumberShots(db: ProjectDb, clipId: number): void {
  shotIdsInOrder(db, clipId).forEach((id, position) => {
    db.update(schema.shots).set({ position }).where(eq(schema.shots.id, id)).run()
  })
}

/** One shot saved in the library, which is a starting point rather than part of any clip. */
export interface SavedShot {
  id: number
  name: string
  lines: number
  durationMs: number
}

/** The shots saved in the library, by name. */
export function listSavedShots(db: ProjectDatabase): SavedShot[] {
  const counts = db
    .select({ shotId: schema.shotLines.shotId, lines: count() })
    .from(schema.shotLines)
    .groupBy(schema.shotLines.shotId)
    .all()

  return db
    .select()
    .from(schema.shots)
    .where(isNull(schema.shots.clipId))
    .orderBy(asc(schema.shots.name))
    .all()
    .map((shot) => ({
      id: shot.id,
      name: shot.name ?? "",
      lines: counts.find((entry) => entry.shotId === shot.id)?.lines ?? 0,
      durationMs: shot.durationMs,
    }))
}

/**
 * Copies a shot into the library under a name, with the subjects it names copied beside it, so it
 * can be dropped into any clip later.
 */
export function saveShot(db: ProjectDatabase, shotId: number, name: string): SavedShot {
  return db.transaction((tx) => {
    const shot = tx.select().from(schema.shots).where(eq(schema.shots.id, shotId)).get()
    if (!shot) {
      throw CompositionError.notFound(`Shot ${shotId}`)
    }

    const saved = tx
      .insert(schema.shots)
      .values({ ...shot, id: undefined, clipId: null, name, position: 0 })
      .returning()
      .get()

    copyShotContents(tx, shot.id, saved.id, copySubjects(tx, shot.id, null))
    return { id: saved.id, name, lines: 0, durationMs: saved.durationMs }
  })
}

/** Copies a saved shot onto the end of a clip, bringing the subjects it names into the cast. */
export function addSavedShot(db: ProjectDatabase, clipId: number, savedShotId: number): number {
  return db.transaction((tx) => {
    const saved = tx.select().from(schema.shots).where(eq(schema.shots.id, savedShotId)).get()
    if (!saved || saved.clipId !== null) {
      throw CompositionError.notFound(`Saved shot ${savedShotId}`)
    }

    const copy = tx
      .insert(schema.shots)
      .values({
        ...saved,
        id: undefined,
        clipId,
        name: null,
        position: shotIdsInOrder(tx, clipId).length,
      })
      .returning()
      .get()

    copyShotContents(tx, saved.id, copy.id, copySubjects(tx, saved.id, clipId))
    return copy.id
  })
}

/** Removes a saved shot, which no clip points at, along with the subjects saved beside it. */
export function deleteSavedShot(db: ProjectDatabase, shotId: number): void {
  const shot = db.select().from(schema.shots).where(eq(schema.shots.id, shotId)).get()
  if (!shot || shot.clipId !== null) {
    throw CompositionError.notFound(`Saved shot ${shotId}`)
  }
  db.delete(schema.shots).where(eq(schema.shots.id, shotId)).run()
}

/**
 * The subjects a shot names, copied to wherever the shot is going, with one already there under
 * the same name used instead of a second copy of the same person.
 */
function copySubjects(tx: ProjectDb, shotId: number, toClipId: number | null): Map<number, number> {
  const named = new Set(
    tx
      .select({ subjectIds: schema.shotLines.subjectIds })
      .from(schema.shotLines)
      .where(eq(schema.shotLines.shotId, shotId))
      .all()
      .flatMap((line) => line.subjectIds)
  )
  const sources =
    named.size === 0
      ? []
      : tx
          .select()
          .from(schema.assets)
          .where(inArray(schema.assets.id, [...named]))
          .all()

  const already = tx
    .select()
    .from(schema.assets)
    .where(toClipId === null ? isNull(schema.assets.clipId) : eq(schema.assets.clipId, toClipId))
    .all()

  const copies = new Map<number, number>()
  for (const source of sources) {
    const match = already.find((entry) => entry.name === source.name)
    if (match) {
      copies.set(source.id, match.id)
      continue
    }
    const copy = tx
      .insert(schema.assets)
      .values({ ...source, id: undefined, clipId: toClipId })
      .returning()
      .get()
    copies.set(source.id, copy.id)

    for (const picture of tx
      .select()
      .from(schema.assetImages)
      .where(eq(schema.assetImages.assetId, source.id))
      .all()) {
      tx.insert(schema.assetImages)
        .values({ ...picture, id: undefined, assetId: copy.id })
        .run()
    }
  }
  return copies
}

/**
 * Puts a clip back the way `composition` had it: its own fields, its cast, its shots and what
 * happens in them. Everything is written again rather than compared, since a clip is small and a
 * step back has to land exactly where it was.
 */
export function restoreComposition(db: ProjectDatabase, composition: ClipComposition): void {
  db.transaction((tx) => {
    tx.update(schema.clips)
      .set({
        name: composition.name,
        style: composition.style,
        note: composition.note,
        musicNote: composition.musicNote,
        language: composition.language,
        form: composition.form,
        shortEdge: composition.shortEdge,
        aspectRatio: composition.aspectRatio,
      })
      .where(eq(schema.clips.id, composition.id))
      .run()

    // The ids are kept, so the lines and the shots that name a subject still find it.
    tx.delete(schema.assets).where(eq(schema.assets.clipId, composition.id)).run()
    for (const subject of composition.cast) {
      tx.insert(schema.assets)
        .values({ ...subject, clipId: composition.id, createdAt: new Date() })
        .run()
    }

    tx.delete(schema.shots).where(eq(schema.shots.clipId, composition.id)).run()
    composition.shots.forEach((shot, position) => {
      tx.insert(schema.shots)
        .values({
          id: shot.id,
          clipId: composition.id,
          name: null,
          position,
          durationMs: shot.durationMs,
          cameraMotion: shot.cameraMotion,
          amplitude: shot.amplitude,
          speed: shot.speed,
          transition: shot.transition,
          lighting: shot.lighting,
          soundNote: shot.soundNote,
        })
        .run()

      shot.lines.forEach((line, at) => {
        tx.insert(schema.shotLines)
          .values({
            id: line.id,
            shotId: shot.id,
            position: at,
            kind: line.kind,
            subjectIds: line.subjectIds,
            text: line.text,
            language: line.language,
            offScreen: line.offScreen,
            crossesCut: line.crossesCut,
            cutOff: line.cutOff,
          })
          .run()
      })
    })

    tx.delete(schema.clipFrames).where(eq(schema.clipFrames.clipId, composition.id)).run()
    for (const frame of composition.frames) {
      tx.insert(schema.clipFrames)
        .values({ clipId: composition.id, imageId: frame.imageId, role: frame.role })
        .run()
    }
  })
}
