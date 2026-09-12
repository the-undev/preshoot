import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("assets router", () => {
  let dir: string
  let session: ProjectSession
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-assets-router-"))
    session = new ProjectSession()
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      settings: new AppSettingsStore(join(dir, "settings.json")),
      migrationsFolder,
      dialogs: { pickDirectory: async () => null },
      promptClient: () => {
        throw new Error("the assets router does not generate prompts")
      },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function openProject(): Promise<void> {
    await caller.projects.create({
      directory: join(dir, "film"),
      name: "Film",
      createDirectory: false,
      allowNonEmpty: false,
    })
  }

  it("refuses to list without an open project", async () => {
    await expect(caller.assets.list()).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("stores a thing and lists it", async () => {
    await openProject()

    const created = await caller.assets.create({
      kind: "person",
      name: "Keeper",
      description: "an elderly man in oilskins",
    })

    expect(created.kind).toBe("person")
    expect(await caller.assets.list()).toEqual([created])
  })

  it("rejects a kind that is not a person, a place or an object", async () => {
    await openProject()

    await expect(
      caller.assets.create({
        kind: "vehicle" as "person",
        name: "Van",
        description: "a rusted transit",
      })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("rewrites a thing", async () => {
    await openProject()
    const created = await caller.assets.create({
      kind: "object",
      name: "Lamp",
      description: "brass",
    })

    const changed = await caller.assets.update({
      id: created.id,
      name: "Lamp",
      description: "brass and glass",
    })

    expect(changed.description).toBe("brass and glass")
  })

  it("refuses to remove a thing a shot still shows", async () => {
    await openProject()
    const keeper = await caller.assets.create({
      kind: "person",
      name: "Keeper",
      description: "an elderly man",
    })
    const clip = await caller.clips.create({ name: "Lighthouse" })
    const composition = await caller.clips.addShot({ clipId: clip.id })
    await caller.clips.updateShot({
      shotId: composition.shots[0].id,
      durationMs: 4000,
      cameraMotion: null,
      amplitude: null,
      speed: null,
      transition: null,
      lighting: null,
      action: "climbs",
      soundNote: "",
      things: [keeper.id],
      dialogue: [],
    })

    await expect(caller.assets.remove({ id: keeper.id })).rejects.toThrow(
      expect.objectContaining({ code: "CONFLICT" })
    )
  })
})
