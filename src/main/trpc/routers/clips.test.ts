import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

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
    const clip = await caller.clips.create({ name: "Lighthouse" })
    const composition = await caller.clips.addShot({ clipId: clip.id })
    return { clipId: clip.id, shotId: composition.shots[0].id }
  }

  it("starts a clip on the default target and style", async () => {
    const clip = await caller.clips.create({ name: "Lighthouse" })

    expect(clip.target).toBe("minimax-h3")
    expect(clip.style).toBe("Live-action, cinematic")
    expect(await caller.clips.list()).toEqual([clip])
  })

  it("offers the target's vocabularies", async () => {
    const clip = await caller.clips.create({ name: "Lighthouse" })

    const vocabularies = await caller.clips.vocabularies({ clipId: clip.id })

    expect(vocabularies.cameraMotions).toContain("push in")
    expect(vocabularies.transitions).toContain("the camera cuts to")
  })

  it("adds shots and gives back the whole clip each time", async () => {
    const clip = await caller.clips.create({ name: "Lighthouse" })

    await caller.clips.addShot({ clipId: clip.id })
    const composition = await caller.clips.addShot({ clipId: clip.id })

    expect(composition.shots).toHaveLength(2)
    expect(composition.shots[0].durationMs).toBe(4000)
  })

  it("rewrites a shot with the things it shows and what is said", async () => {
    const { clipId, shotId } = await clipWithShot()
    const keeper = await caller.assets.create({
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })
    const withSpeaker = await caller.clips.addSpeaker({
      clipId,
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
      action: "climbs the last steps",
      soundNote: "wind on the glass",
      things: [keeper.id],
      dialogue: [
        {
          speakerId: withSpeaker.speakers[0].id,
          language: "English",
          text: "Almost there.",
        },
      ],
    })

    const [shot] = composition.shots
    expect(shot.durationMs).toBe(4500)
    expect(shot.cameraMotion).toBe("push in")
    expect(shot.things).toEqual([
      { id: keeper.id, kind: "person", name: "Keeper", description: "an elderly man" },
    ])
    expect(shot.dialogue[0].text).toBe("Almost there.")
    expect(composition.speakers[0].label).toBe("S1")
  })

  it("keeps a dialogue line that has not been typed into yet", async () => {
    const { clipId, shotId } = await clipWithShot()
    const withSpeaker = await caller.clips.addSpeaker({ clipId, description: "The keeper" })

    const composition = await caller.clips.updateShot({
      shotId,
      durationMs: 4000,
      cameraMotion: null,
      amplitude: null,
      speed: null,
      transition: null,
      lighting: null,
      action: "climbs",
      soundNote: "",
      things: [],
      dialogue: [{ speakerId: withSpeaker.speakers[0].id, language: "English", text: "" }],
    })

    expect(composition.shots[0].dialogue).toEqual([
      { speakerId: withSpeaker.speakers[0].id, language: "English", text: "" },
    ])
  })

  it("keeps a clip whose name is being retyped", async () => {
    const clip = await caller.clips.create({ name: "Lighthouse" })

    const emptied = await caller.clips.update({
      id: clip.id,
      name: "",
      style: "",
      note: "",
      musicNote: "",
    })

    expect(emptied.name).toBe("")
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
        action: "climbs",
        soundNote: "",
        things: [],
        dialogue: [],
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
        action: "climbs",
        soundNote: "",
        things: [],
        dialogue: [],
      })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("moves a shot and removes one", async () => {
    const clip = await caller.clips.create({ name: "Lighthouse" })
    await caller.clips.addShot({ clipId: clip.id })
    await caller.clips.addShot({ clipId: clip.id })
    const three = await caller.clips.addShot({ clipId: clip.id })
    const ids = three.shots.map((shot) => shot.id)

    const moved = await caller.clips.moveShot({ shotId: ids[2], toPosition: 0 })
    expect(moved.shots.map((shot) => shot.id)).toEqual([ids[2], ids[0], ids[1]])

    const removed = await caller.clips.removeShot({ shotId: ids[0] })
    expect(removed.shots.map((shot) => shot.id)).toEqual([ids[2], ids[1]])
  })

  it("renumbers the speakers when one goes", async () => {
    const clip = await caller.clips.create({ name: "Lighthouse" })
    await caller.clips.addSpeaker({ clipId: clip.id, description: "The keeper" })
    const both = await caller.clips.addSpeaker({ clipId: clip.id, description: "The operator" })

    const left = await caller.clips.removeSpeaker({ speakerId: both.speakers[0].id })

    expect(left.speakers).toEqual([
      { id: both.speakers[1].id, label: "S1", description: "The operator" },
    ])
  })

  it("refuses a clip that is not there", async () => {
    await expect(caller.clips.composition({ clipId: 99 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })

  it("removes a clip and says nothing had been generated for it", async () => {
    const clip = await caller.clips.create({ name: "Lighthouse" })

    expect(await caller.clips.remove({ id: clip.id })).toEqual({ prompts: 0 })
    expect(await caller.clips.list()).toEqual([])
  })
})
