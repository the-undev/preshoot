import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { LineInput } from "../../core/composition/clip-store"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** Something happening, as the editor sends a shot back. */
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

/** Something said, as the editor sends a shot back. */
function speech(subjectIds: number[], text: string): LineInput {
  return { ...action(null, text), kind: "speech", subjectIds }
}

describe("clips router", () => {
  let dir: string
  let session: ProjectSession
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-clips-router-"))
    session = new ProjectSession()
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      settings: new AppSettingsStore(join(dir, "settings.json")),
      migrationsFolder,
      dialogs: {
        pickDirectory: async () => null,
        pickFiles: async () => [],
        saveFile: async () => null,
      },
      openPath: async () => {},
      promptClient: () => {
        throw new Error("the clips router does not generate prompts")
      },
    }
    caller = appRouter.createCaller(ctx)
    await caller.projects.create({
      directory: join(dir, "film"),
      name: "Film",
      createDirectory: false,
      allowNonEmpty: false,
    })
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function clipWithShot(): Promise<{ clipId: number; shotId: number }> {
    const clip = await caller.clips.create()
    const composition = await caller.clips.composition({ clipId: clip.id })
    return { clipId: clip.id, shotId: composition.shots[0].id }
  }

  it("starts a clip on the default target and style", async () => {
    const clip = await caller.clips.create()

    expect(clip.target).toBe("minimax-h3")
    expect(clip.style).toBe("Live-action, cinematic")
  })

  it("offers the target's vocabularies", async () => {
    const clip = await caller.clips.create()

    const vocabularies = await caller.clips.vocabularies({ clipId: clip.id })

    expect(vocabularies.cameraMotions).toContain("push in")
    expect(vocabularies.transitions).toContain("the camera cuts to")
  })

  it("starts a clip with the shot it will need", async () => {
    const clip = await caller.clips.create()

    const composition = await caller.clips.composition({ clipId: clip.id })

    expect(composition.shots).toHaveLength(1)
    expect(composition.shots[0].durationMs).toBe(4000)
  })

  it("adds shots and gives back the whole clip each time", async () => {
    const clip = await caller.clips.create()

    await caller.clips.addShot({ clipId: clip.id })
    const composition = await caller.clips.addShot({ clipId: clip.id })

    expect(composition.shots).toHaveLength(3)
  })

  it("rewrites a shot with the things it shows and what is said", async () => {
    const { clipId, shotId } = await clipWithShot()
    const withKeeper = await caller.clips.addSubject({
      clipId,
      savedId: null,
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })
    const keeper = withKeeper.cast[0]
    const withSpeaker = await caller.clips.addSubject({
      clipId,
      savedId: null,
      kind: "person",
      name: "The keeper, low and weathered",
      description: "The keeper, low and weathered",
    })

    const composition = await caller.clips.updateShot({
      shotId,
      durationMs: 4500,
      cameraMotion: "push in",
      amplitude: "with small amplitude",
      speed: "at slow speed",
      transition: null,
      lighting: "night",
      soundNote: "wind on the glass",
      things: [keeper.id],
      lines: [
        action(null, "climbs the last steps"),
        speech([withSpeaker.cast[0].id], "Almost there."),
      ],
    })

    const [shot] = composition.shots
    expect(shot.durationMs).toBe(4500)
    expect(shot.cameraMotion).toBe("push in")
    expect(shot.things).toEqual([expect.objectContaining({ id: keeper.id, name: "Keeper" })])
    expect(shot.lines.map((line) => line.kind)).toEqual(["action", "speech"])
    expect(shot.lines[1].text).toBe("Almost there.")
  })

  it("keeps a dialogue line that has not been typed into yet", async () => {
    const { clipId, shotId } = await clipWithShot()
    const withSpeaker = await caller.clips.addSubject({
      clipId,
      savedId: null,
      kind: "person",
      name: "The keeper",
      description: "The keeper",
    })

    const composition = await caller.clips.updateShot({
      shotId,
      durationMs: 4000,
      cameraMotion: null,
      amplitude: null,
      speed: null,
      transition: null,
      lighting: null,
      soundNote: "",
      things: [],
      lines: [action(null, "climbs"), speech([withSpeaker.cast[0].id], "")],
    })

    expect(composition.shots[0].lines).toEqual([
      expect.objectContaining({ kind: "action", text: "climbs" }),
      expect.objectContaining({ subjectIds: [withSpeaker.cast[0].id], text: "" }),
    ])
  })

  it("starts a clip with no name, so it is not in the project's list", async () => {
    const clip = await caller.clips.create()

    expect(clip.name).toBeNull()
    expect(await caller.clips.list()).toEqual([])
  })

  it("puts a clip in the project's list once it is saved", async () => {
    const clip = await caller.clips.create()

    const saved = await caller.clips.save({ id: clip.id, name: "  Lamp room  " })

    expect(saved.name).toBe("Lamp room")
    expect((await caller.clips.list()).map((entry) => entry.name)).toEqual(["Lamp room"])
  })

  it("branches a clip into a new scratch clip, leaving the original alone", async () => {
    const { clipId, shotId } = await clipWithShot()
    await caller.clips.save({ id: clipId, name: "Lighthouse" })
    await caller.clips.updateShot({
      shotId,
      durationMs: 4000,
      cameraMotion: "push in",
      amplitude: null,
      speed: null,
      transition: null,
      lighting: "night",
      soundNote: "wind",
      things: [],
      lines: [action(null, "climbs the stairs")],
    })

    const branch = await caller.clips.branch({ id: clipId })
    const copy = await caller.clips.composition({ clipId: branch.id })
    const original = await caller.clips.composition({ clipId })

    expect(branch.name).toBeNull()
    expect(branch.savedFromId).toBe(clipId)
    expect(copy.shots).toHaveLength(1)
    expect(copy.shots[0].id).not.toBe(shotId)
    expect(copy.shots[0].cameraMotion).toBe("push in")
    expect(copy.shots[0].lines).toEqual([
      expect.objectContaining({ subjectIds: [], text: "climbs the stairs" }),
    ])
    expect(original.shots[0].lines).toEqual([
      expect.objectContaining({ subjectIds: [], text: "climbs the stairs" }),
    ])
  })

  it("keeps a branch pointing at the saved clip underneath, not at the branch it came from", async () => {
    const clip = await caller.clips.create()
    await caller.clips.save({ id: clip.id, name: "Lighthouse" })

    const first = await caller.clips.branch({ id: clip.id })
    const second = await caller.clips.branch({ id: first.id })

    expect(first.savedFromId).toBe(clip.id)
    expect(second.savedFromId).toBe(clip.id)
  })

  it("copies the cast of a clip and renumbers the lines that name them", async () => {
    const { clipId, shotId } = await clipWithShot()
    const withSpeaker = await caller.clips.addSubject({
      clipId,
      savedId: null,
      kind: "person",
      name: "The keeper",
      description: "The keeper",
    })
    const speakerId = withSpeaker.cast[0].id
    await caller.clips.updateShot({
      shotId,
      durationMs: 4000,
      cameraMotion: null,
      amplitude: null,
      speed: null,
      transition: null,
      lighting: null,
      soundNote: "",
      things: [],
      lines: [speech([speakerId], "Almost there.")],
    })

    const branch = await caller.clips.branch({ id: clipId })
    const copy = await caller.clips.composition({ clipId: branch.id })

    expect(copy.cast).toHaveLength(1)
    expect(copy.cast[0].id).not.toBe(speakerId)
    expect(copy.shots[0].lines[0].subjectIds).toEqual([copy.cast[0].id])
  })

  it("refuses to branch a clip that is not there", async () => {
    await expect(caller.clips.branch({ id: 99 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })

  it("refuses to save a clip under nothing but space", async () => {
    const clip = await caller.clips.create()

    await expect(caller.clips.save({ id: clip.id, name: "   " })).rejects.toThrow()
  })

  it("says which field a bad input was, rather than answering with the schema", async () => {
    const { shotId } = await clipWithShot()

    await expect(
      caller.clips.updateShot({
        shotId,
        durationMs: 0,
        cameraMotion: null,
        amplitude: null,
        speed: null,
        transition: null,
        lighting: null,
        soundNote: "",
        things: [],
        lines: [action(null, "climbs")],
      })
    ).rejects.toThrow(expect.objectContaining({ message: expect.stringContaining("durationMs") }))
  })

  it("refuses a camera motion the target does not know", async () => {
    const { shotId } = await clipWithShot()

    await expect(
      caller.clips.updateShot({
        shotId,
        durationMs: 4000,
        cameraMotion: "swoosh about",
        amplitude: null,
        speed: null,
        transition: null,
        lighting: null,
        soundNote: "",
        things: [],
        lines: [action(null, "climbs")],
      })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("moves a shot and removes one", async () => {
    const clip = await caller.clips.create()
    await caller.clips.addShot({ clipId: clip.id })
    const three = await caller.clips.addShot({ clipId: clip.id })
    const ids = three.shots.map((shot) => shot.id)

    const moved = await caller.clips.moveShot({ shotId: ids[2], toPosition: 0 })
    expect(moved.shots.map((shot) => shot.id)).toEqual([ids[2], ids[0], ids[1]])

    const removed = await caller.clips.removeShot({ shotId: ids[0] })
    expect(removed.shots.map((shot) => shot.id)).toEqual([ids[2], ids[1]])
  })

  it("adds a subject to the clip and takes it out again", async () => {
    const clip = await caller.clips.create()

    const added = await caller.clips.addSubject({
      clipId: clip.id,
      savedId: null,
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })
    const emptied = await caller.clips.removeSubject({ subjectId: added.cast[0].id })

    expect(added.cast.map((subject) => subject.name)).toEqual(["Keeper"])
    expect(emptied.cast).toEqual([])
  })

  it("copies a saved subject into the clip rather than sharing it", async () => {
    const clip = await caller.clips.create()
    const saved = await caller.assets.create({
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })

    const added = await caller.clips.addSubject({
      clipId: clip.id,
      savedId: saved.id,
      kind: "person",
      name: "",
      description: "",
    })
    await caller.clips.updateSubject({
      subjectId: added.cast[0].id,
      kind: "person",
      name: "Keeper",
      description: "soaked through",
      voice: null,
    })

    expect(added.cast[0].id).not.toBe(saved.id)
    expect((await caller.assets.list())[0].description).toBe("an elderly man")
  })

  it("saves one of the clip's subjects into the library as a copy", async () => {
    const clip = await caller.clips.create()
    const added = await caller.clips.addSubject({
      clipId: clip.id,
      savedId: null,
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })

    const saved = await caller.assets.save({ id: added.cast[0].id })

    expect(saved.clipId).toBeNull()
    expect((await caller.assets.list()).map((entry) => entry.name)).toEqual(["Keeper"])
  })

  it("saves a shot into the library and drops it into another clip", async () => {
    const { clipId, shotId } = await clipWithShot()
    const withKeeper = await caller.clips.addSubject({
      clipId,
      savedId: null,
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })
    const keeper = withKeeper.cast[0]
    await caller.clips.updateShot({
      shotId,
      durationMs: 6000,
      cameraMotion: null,
      amplitude: null,
      speed: null,
      transition: null,
      lighting: "night",
      soundNote: "wind",
      things: [keeper.id],
      lines: [action(keeper.id, "climbs the steps")],
    })

    const saved = await caller.clips.saveShot({ shotId, name: "Climbing the tower" })
    const other = await caller.clips.create()
    const added = await caller.clips.addSavedShot({
      clipId: other.id,
      savedShotId: saved.id,
    })

    expect((await caller.clips.savedShots()).map((entry) => entry.name)).toEqual([
      "Climbing the tower",
    ])
    const dropped = added.shots[added.shots.length - 1]
    expect(dropped.durationMs).toBe(6000)
    expect(dropped.lighting).toBe("night")
    expect(dropped.lines[0].text).toBe("climbs the steps")
    expect(added.cast.map((subject) => subject.name)).toEqual(["Keeper"])
    expect(added.cast[0].id).not.toBe(keeper.id)
    expect(dropped.lines[0].subjectIds).toEqual([added.cast[0].id])
  })

  it("uses a subject the clip already has rather than copying a second one", async () => {
    const { clipId, shotId } = await clipWithShot()
    const withKeeper = await caller.clips.addSubject({
      clipId,
      savedId: null,
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })
    await caller.clips.updateShot({
      shotId,
      durationMs: 4000,
      cameraMotion: null,
      amplitude: null,
      speed: null,
      transition: null,
      lighting: null,
      soundNote: "",
      things: [withKeeper.cast[0].id],
      lines: [],
    })
    const saved = await caller.clips.saveShot({ shotId, name: "A shot of the keeper" })

    const again = await caller.clips.addSavedShot({ clipId, savedShotId: saved.id })

    expect(again.cast.map((subject) => subject.name)).toEqual(["Keeper"])
  })

  it("leaves the clip's own shot alone when one is saved", async () => {
    const { clipId, shotId } = await clipWithShot()

    await caller.clips.saveShot({ shotId, name: "A shot" })

    const composition = await caller.clips.composition({ clipId })
    expect(composition.shots).toHaveLength(1)
    expect(composition.shots[0].id).toBe(shotId)
  })

  it("removes a saved shot from the library", async () => {
    const { shotId } = await clipWithShot()
    const saved = await caller.clips.saveShot({ shotId, name: "A shot" })

    await caller.clips.removeSavedShot({ shotId: saved.id })

    expect(await caller.clips.savedShots()).toEqual([])
  })

  it("refuses a clip that is not there", async () => {
    await expect(caller.clips.composition({ clipId: 99 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })

  it("removes a clip and everything under it", async () => {
    const clip = await caller.clips.create()

    expect(await caller.clips.remove({ id: clip.id })).toEqual({ id: clip.id })
    expect(await caller.clips.list()).toEqual([])
  })
})
