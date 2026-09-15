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
  setShotLines,
  setShotThings,
  updateClip,
  updateShot,
  type LineInput,
} from "./clip-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** Something happening, as the editor sends it back. */
function action(assetId: number | null, text: string): LineInput {
  return {
    kind: "action",
    assetId,
    speakerIds: [],
    text,
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
  }
}

/** Something said, as the editor sends it back. */
function speech(speakerIds: number[], text: string): LineInput {
  return { ...action(null, text), kind: "speech", speakerIds }
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
    expect(composition.speakers).toEqual([])
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
      form: "t2v",
      shortEdge: 768,
      aspectRatio: "auto",
      language: "English",
    })

    const composition = readComposition(handle.db, clipId)
    expect(composition.style).toBe("vintage film")
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
      soundNote: "wind on the glass",
    })
    setShotLines(handle.db, shotId, [action(null, "climbs the last steps")])

    const [shot] = readComposition(handle.db, clipId).shots
    expect(shot.durationMs).toBe(6000)
    expect(shot.cameraMotion).toBe("push in")
    expect(shot.lighting).toBe("night")
    expect(shot.lines).toEqual([
      expect.objectContaining({ kind: "action", subjectName: null, text: "climbs the last steps" }),
    ])
  })

  it("keeps what happens in the order it was given, with who does it", () => {
    const shotId = insertShot(handle.db, clipId)
    const keeper = insertAsset(handle.db, {
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })

    setShotLines(handle.db, shotId, [
      action(keeper.id, "climbs the last steps"),
      action(null, "rain runs off the rail"),
    ])

    expect(readComposition(handle.db, clipId).shots[0].lines).toEqual([
      expect.objectContaining({ subjectName: "Keeper", text: "climbs the last steps" }),
      expect.objectContaining({ subjectName: null, text: "rain runs off the rail" }),
    ])
  })

  it("keeps what happens and what is said in one list, in the order given", () => {
    const shotId = insertShot(handle.db, clipId)
    const speakerId = insertSpeaker(handle.db, clipId, { assetId: null, description: "The keeper" })

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
    const speakerId = insertSpeaker(handle.db, clipId, {
      assetId: null,
      description: "The keeper, low and weathered",
    })

    setShotLines(handle.db, shotId, [speech([speakerId], "Almost there.")])

    const composition = readComposition(handle.db, clipId)
    expect(composition.speakers).toEqual([
      {
        id: speakerId,
        label: "S1",
        description: "The keeper, low and weathered",
        subjectName: null,
      },
    ])
    expect(composition.shots[0].lines).toEqual([
      expect.objectContaining({
        kind: "speech",
        speakerIds: [speakerId],
        text: "Almost there.",
      }),
    ])
  })

  it("takes a speaker's lines with it and renumbers the rest", () => {
    const shotId = insertShot(handle.db, clipId)
    const first = insertSpeaker(handle.db, clipId, { assetId: null, description: "The keeper" })
    const second = insertSpeaker(handle.db, clipId, {
      assetId: null,
      description: "The radio operator",
    })
    setShotLines(handle.db, shotId, [
      speech([first], "Almost there."),
      speech([second], "Say again."),
    ])

    deleteSpeaker(handle.db, first)

    const composition = readComposition(handle.db, clipId)
    expect(composition.speakers).toEqual([
      { id: second, label: "S1", description: "The radio operator", subjectName: null },
    ])
    expect(composition.shots[0].lines).toEqual([
      expect.objectContaining({ speakerIds: [second], text: "Say again." }),
    ])
  })

  it("takes the shots and their dialogue when the clip goes", () => {
    const shotId = insertShot(handle.db, clipId)
    const speakerId = insertSpeaker(handle.db, clipId, { assetId: null, description: "The keeper" })
    setShotLines(handle.db, shotId, [speech([speakerId], "Almost there.")])

    deleteClip(handle.db, clipId)

    expect(handle.db.select().from(schema.shots).all()).toEqual([])
    expect(handle.db.select().from(schema.shotLines).all()).toEqual([])
    expect(handle.db.select().from(schema.speakers).all()).toEqual([])
  })
})
