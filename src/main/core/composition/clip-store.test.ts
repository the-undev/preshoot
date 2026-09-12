import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, schema, type ProjectDatabaseHandle } from "../db"
import { insertAsset } from "./asset-store"
import {
  deleteClip,
  deleteShot,
  deleteSpeaker,
  insertClip,
  insertShot,
  insertSpeaker,
  listClips,
  moveShot,
  readComposition,
  setShotDialogue,
  setShotThings,
  updateClip,
  updateShot,
} from "./clip-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

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
    expect(composition.speakers).toEqual([])
  })

  it("lists clips newest first", () => {
    insertClip(handle.db, { name: "Second", target: "minimax-h3", style: "Live-action" })

    expect(listClips(handle.db).map((clip) => clip.name)).toEqual(["Second", "Lighthouse"])
  })

  it("rewrites the clip's own fields", () => {
    updateClip(handle.db, {
      id: clipId,
      name: "Lamp room",
      style: "vintage film",
      note: "A keeper lights the lamp.",
      musicNote: "A slow piano figure.",
    })

    const composition = readComposition(handle.db, clipId)
    expect(composition.name).toBe("Lamp room")
    expect(composition.note).toBe("A keeper lights the lamp.")
    expect(composition.musicNote).toBe("A slow piano figure.")
  })

  it("refuses a clip that is not there", () => {
    expect(() => readComposition(handle.db, 99)).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
  })

  it("adds shots at the end and reads them back in order", () => {
    const first = insertShot(handle.db, clipId)
    const second = insertShot(handle.db, clipId)

    expect(readComposition(handle.db, clipId).shots.map((shot) => shot.id)).toEqual([first, second])
  })

  it("rewrites a shot's own fields", () => {
    const shotId = insertShot(handle.db, clipId)

    updateShot(handle.db, {
      id: shotId,
      durationMs: 6000,
      cameraMotion: "push in",
      amplitude: "with small amplitude",
      speed: "at slow speed",
      transition: null,
      lighting: "night",
      action: "climbs the last steps",
      soundNote: "wind on the glass",
    })

    const [shot] = readComposition(handle.db, clipId).shots
    expect(shot.durationMs).toBe(6000)
    expect(shot.cameraMotion).toBe("push in")
    expect(shot.lighting).toBe("night")
    expect(shot.action).toBe("climbs the last steps")
  })

  it("moves a shot and renumbers the rest", () => {
    const first = insertShot(handle.db, clipId)
    const second = insertShot(handle.db, clipId)
    const third = insertShot(handle.db, clipId)

    moveShot(handle.db, third, 0)

    expect(readComposition(handle.db, clipId).shots.map((shot) => shot.id)).toEqual([
      third,
      first,
      second,
    ])
  })

  it("closes the gap when a shot goes", () => {
    const first = insertShot(handle.db, clipId)
    const second = insertShot(handle.db, clipId)
    const third = insertShot(handle.db, clipId)

    deleteShot(handle.db, second)

    const positions = handle.db.select().from(schema.shots).all()
    expect(positions.map((shot) => [shot.id, shot.position])).toEqual([
      [first, 0],
      [third, 1],
    ])
  })

  it("replaces the things a shot shows, keeping the order given", () => {
    const shotId = insertShot(handle.db, clipId)
    const keeper = insertAsset(handle.db, {
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })
    const lamp = insertAsset(handle.db, {
      kind: "object",
      name: "Lamp",
      description: "brass and glass",
    })

    setShotThings(handle.db, shotId, [lamp.id, keeper.id])
    setShotThings(handle.db, shotId, [keeper.id, lamp.id])

    const [shot] = readComposition(handle.db, clipId).shots
    expect(shot.things.map((thing) => thing.name)).toEqual(["Keeper", "Lamp"])
    expect(shot.things.map((thing) => thing.id)).toEqual([keeper.id, lamp.id])
    expect(shot.things[0].description).toBe("an elderly man")
  })

  it("keeps dialogue against its speaker", () => {
    const shotId = insertShot(handle.db, clipId)
    const speakerId = insertSpeaker(handle.db, clipId, "The keeper, low and weathered")

    setShotDialogue(handle.db, shotId, [{ speakerId, language: "English", text: "Almost there." }])

    const composition = readComposition(handle.db, clipId)
    expect(composition.speakers).toEqual([
      { id: speakerId, label: "S1", description: "The keeper, low and weathered" },
    ])
    expect(composition.shots[0].dialogue).toEqual([
      { speakerId, language: "English", text: "Almost there." },
    ])
  })

  it("takes a speaker's lines with it and renumbers the rest", () => {
    const shotId = insertShot(handle.db, clipId)
    const first = insertSpeaker(handle.db, clipId, "The keeper")
    const second = insertSpeaker(handle.db, clipId, "The radio operator")
    setShotDialogue(handle.db, shotId, [
      { speakerId: first, language: "English", text: "Almost there." },
      { speakerId: second, language: "English", text: "Say again." },
    ])

    deleteSpeaker(handle.db, first)

    const composition = readComposition(handle.db, clipId)
    expect(composition.speakers).toEqual([
      { id: second, label: "S1", description: "The radio operator" },
    ])
    expect(composition.shots[0].dialogue).toEqual([
      { speakerId: second, language: "English", text: "Say again." },
    ])
  })

  it("counts what has been generated for each clip", () => {
    expect(listClips(handle.db)[0].prompts).toBe(0)
  })

  it("takes the shots and their dialogue when the clip goes", () => {
    const shotId = insertShot(handle.db, clipId)
    const speakerId = insertSpeaker(handle.db, clipId, "The keeper")
    setShotDialogue(handle.db, shotId, [{ speakerId, language: "English", text: "Almost there." }])

    deleteClip(handle.db, clipId)

    expect(handle.db.select().from(schema.shots).all()).toEqual([])
    expect(handle.db.select().from(schema.dialogueLines).all()).toEqual([])
    expect(handle.db.select().from(schema.speakers).all()).toEqual([])
  })
})
