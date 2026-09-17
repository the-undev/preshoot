import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema, type ProjectDatabaseHandle } from "../db"
import { insertAsset } from "./asset-store"
import {
  deleteClip,
  deleteShot,
  insertClip,
  insertShot,
  listClips,
  moveLine,
  moveShot,
  readComposition,
  setShotLines,
  updateClip,
  updateShot,
  type LineInput,
} from "./clip-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** Something happening, as the editor sends it back. */
function action(subjectId: number | null, text: string): LineInput {
  return {
    kind: "action",
    subjectIds: subjectId === null ? [] : [subjectId],
    text,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

/** Something said, as the editor sends it back. */
function speech(subjectIds: number[], text: string): LineInput {
  return { ...action(null, text), kind: "speech", subjectIds }
}

/** One of a clip's own subjects. */
function subjectIn(handle: ProjectDatabaseHandle, clipId: number, name: string): number {
  return insertAsset(handle.db, { clipId, kind: "person", name, description: `the ${name}` }).id
}

describe("clip store", () => {
  let dir: string
  let handle: ProjectDatabaseHandle
  let clipId: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-clips-"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
    clipId = insertClip(handle.db, {
      name: "Lighthouse",
      target: "minimax-h3",
      style: "Live-action, cinematic",
    }).id
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it("starts a clip with no shots and no speakers", () => {
    const composition = readComposition(handle.db, clipId)

    expect(composition.name).toBe("Lighthouse")
    expect(composition.style).toBe("Live-action, cinematic")
    expect(composition.shots).toEqual([])
    expect(composition.cast).toEqual([])
  })

  it("lists clips newest first", () => {
    insertClip(handle.db, { name: "Second", target: "minimax-h3", style: "Live-action" })

    expect(listClips(handle.db).map((clip) => clip.name)).toEqual(["Second", "Lighthouse"])
  })

  it("rewrites the clip's own fields", () => {
    updateClip(handle.db, {
      id: clipId,
      style: "vintage film",
      note: "A keeper lights the lamp.",
      musicNote: "A slow piano figure.",
      soundscape: "Wind on the glass.",
      form: "t2v",
      shortEdge: 768,
      aspectRatio: "auto",
      language: "English",
    })

    const composition = readComposition(handle.db, clipId)
    expect(composition.style).toBe("vintage film")
    expect(composition.note).toBe("A keeper lights the lamp.")
    expect(composition.musicNote).toBe("A slow piano figure.")
    expect(composition.soundscape).toBe("Wind on the glass.")
  })

  it("refuses a clip that is not there", () => {
    expect(() => readComposition(handle.db, 99)).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
  })

  it("adds shots at the end and reads them back in order", () => {
    const first = insertShot(handle.db, clipId, "the camera cuts to")
    const second = insertShot(handle.db, clipId, "the camera cuts to")

    expect(readComposition(handle.db, clipId).shots.map((shot) => shot.id)).toEqual([first, second])
  })

  it("rewrites a shot's own fields", () => {
    const shotId = insertShot(handle.db, clipId, "the camera cuts to")

    updateShot(handle.db, {
      id: shotId,
      durationMs: 6000,
      cameraMotion: "push in",
      amplitude: "with small amplitude",
      speed: "at slow speed",
      transition: null,
      lighting: "night",
    })
    setShotLines(handle.db, shotId, [action(null, "climbs the last steps")])

    const [shot] = readComposition(handle.db, clipId).shots
    expect(shot.durationMs).toBe(6000)
    expect(shot.cameraMotion).toBe("push in")
    expect(shot.lighting).toBe("night")
    expect(shot.lines).toEqual([
      expect.objectContaining({ kind: "action", subjectIds: [], text: "climbs the last steps" }),
    ])
  })

  it("keeps what happens in the order it was given, with who does it", () => {
    const shotId = insertShot(handle.db, clipId, "the camera cuts to")
    const keeper = insertAsset(handle.db, {
      clipId: null,
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })

    setShotLines(handle.db, shotId, [
      action(keeper.id, "climbs the last steps"),
      action(null, "rain runs off the rail"),
    ])

    expect(readComposition(handle.db, clipId).shots[0].lines).toEqual([
      expect.objectContaining({ subjectIds: [keeper.id], text: "climbs the last steps" }),
      expect.objectContaining({ subjectIds: [], text: "rain runs off the rail" }),
    ])
  })

  it("keeps what happens and what is said in one list, in the order given", () => {
    const shotId = insertShot(handle.db, clipId, "the camera cuts to")
    const speakerId = subjectIn(handle, clipId, "Keeper")

    setShotLines(handle.db, shotId, [
      action(null, "the lamp turns"),
      speech([speakerId], "Almost there."),
      action(null, "the beam sweeps the water"),
    ])

    expect(readComposition(handle.db, clipId).shots[0].lines.map((line) => line.kind)).toEqual([
      "action",
      "speech",
      "action",
    ])
  })

  it("moves a shot and renumbers the rest", () => {
    const first = insertShot(handle.db, clipId, "the camera cuts to")
    const second = insertShot(handle.db, clipId, "the camera cuts to")
    const third = insertShot(handle.db, clipId, "the camera cuts to")

    moveShot(handle.db, third, 0)

    expect(readComposition(handle.db, clipId).shots.map((shot) => shot.id)).toEqual([
      third,
      first,
      second,
    ])
  })

  it("closes the gap when a shot goes", () => {
    const first = insertShot(handle.db, clipId, "the camera cuts to")
    const second = insertShot(handle.db, clipId, "the camera cuts to")
    const third = insertShot(handle.db, clipId, "the camera cuts to")

    deleteShot(handle.db, second)

    const positions = handle.db.select().from(schema.shots).all()
    expect(positions.map((shot) => [shot.id, shot.position])).toEqual([
      [first, 0],
      [third, 1],
    ])
  })

  it("keeps what a shot shows as lines of its own, in the order given", () => {
    const shotId = insertShot(handle.db, clipId, "the camera cuts to")
    const lamp = insertAsset(handle.db, {
      clipId,
      kind: "object",
      name: "Lamp",
      description: "brass and glass",
    })

    setShotLines(handle.db, shotId, [
      { ...action(lamp.id, "unlit"), kind: "shows" },
      action(null, "the beam sweeps the water"),
    ])

    const [shot] = readComposition(handle.db, clipId).shots
    expect(shot.lines).toEqual([
      expect.objectContaining({ kind: "shows", subjectIds: [lamp.id], text: "unlit" }),
      expect.objectContaining({ kind: "action", text: "the beam sweeps the water" }),
    ])
  })

  it("moves a line down its own shot, closing the gap it left", () => {
    const shotId = insertShot(handle.db, clipId, "the camera cuts to")
    setShotLines(handle.db, shotId, [
      action(null, "one"),
      action(null, "two"),
      action(null, "three"),
    ])

    moveLine(handle.db, { shotId, at: 0, toShotId: shotId, toPosition: 2 })

    expect(readComposition(handle.db, clipId).shots[0].lines.map((line) => line.text)).toEqual([
      "two",
      "three",
      "one",
    ])
  })

  it("takes a line out of one shot and puts it in another", () => {
    const first = insertShot(handle.db, clipId, "the camera cuts to")
    const second = insertShot(handle.db, clipId, "the camera cuts to")
    setShotLines(handle.db, first, [action(null, "one"), action(null, "two")])
    setShotLines(handle.db, second, [action(null, "three")])

    moveLine(handle.db, { shotId: first, at: 0, toShotId: second, toPosition: 0 })

    const shots = readComposition(handle.db, clipId).shots
    expect(shots[0].lines.map((line) => line.text)).toEqual(["two"])
    expect(shots[1].lines.map((line) => line.text)).toEqual(["one", "three"])
  })

  it("keeps a moved line's id, so what named it still names it", () => {
    const first = insertShot(handle.db, clipId, "the camera cuts to")
    const second = insertShot(handle.db, clipId, "the camera cuts to")
    setShotLines(handle.db, first, [action(null, "one")])
    const before = readComposition(handle.db, clipId).shots[0].lines[0].id

    moveLine(handle.db, { shotId: first, at: 0, toShotId: second, toPosition: 0 })

    expect(readComposition(handle.db, clipId).shots[1].lines[0].id).toBe(before)
  })

  it("puts a line at the end when it is dropped past it", () => {
    const first = insertShot(handle.db, clipId, "the camera cuts to")
    const second = insertShot(handle.db, clipId, "the camera cuts to")
    setShotLines(handle.db, first, [action(null, "one")])
    setShotLines(handle.db, second, [action(null, "two")])

    moveLine(handle.db, { shotId: first, at: 0, toShotId: second, toPosition: 99 })

    expect(readComposition(handle.db, clipId).shots[1].lines.map((line) => line.text)).toEqual([
      "two",
      "one",
    ])
  })

  it("refuses to move a line into a shot of another clip", () => {
    const first = insertShot(handle.db, clipId, "the camera cuts to")
    setShotLines(handle.db, first, [action(null, "one")])
    const other = insertClip(handle.db, { name: "Other", target: "minimax-h3", style: "" }).id
    const elsewhere = insertShot(handle.db, other, "the camera cuts to")

    expect(() =>
      moveLine(handle.db, { shotId: first, at: 0, toShotId: elsewhere, toPosition: 0 })
    ).toThrow(expect.objectContaining({ code: "not-found" }))
  })

  it("refuses to move a line that is not there", () => {
    const shotId = insertShot(handle.db, clipId, "the camera cuts to")

    expect(() => moveLine(handle.db, { shotId, at: 4, toShotId: shotId, toPosition: 0 })).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
  })

  it("keeps a clip's own cast apart from what is saved in the library", () => {
    const own = subjectIn(handle, clipId, "Keeper")
    insertAsset(handle.db, { clipId: null, kind: "person", name: "Saved", description: "x" })

    expect(readComposition(handle.db, clipId).cast.map((subject) => subject.id)).toEqual([own])
  })

  it("keeps dialogue against the subject that says it", () => {
    const shotId = insertShot(handle.db, clipId, "the camera cuts to")
    const keeper = subjectIn(handle, clipId, "Keeper")

    setShotLines(handle.db, shotId, [speech([keeper], "Almost there.")])

    expect(readComposition(handle.db, clipId).shots[0].lines).toEqual([
      expect.objectContaining({ kind: "speech", subjectIds: [keeper], text: "Almost there." }),
    ])
  })

  it("takes the shots, the lines and the cast when the clip goes", () => {
    const shotId = insertShot(handle.db, clipId, "the camera cuts to")
    const keeper = subjectIn(handle, clipId, "Keeper")
    setShotLines(handle.db, shotId, [speech([keeper], "Almost there.")])

    deleteClip(handle.db, dir, clipId)

    expect(handle.db.select().from(schema.shots).all()).toEqual([])
    expect(handle.db.select().from(schema.shotLines).all()).toEqual([])
    expect(handle.db.select().from(schema.assets).all()).toEqual([])
  })
})
