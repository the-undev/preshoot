import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { LlamaServerClient } from "../../core/prompting/llama-server-client"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("prompts router", () => {
  let dir: string
  let session: ProjectSession
  let saveTo: string | null
  let savePrompts: { title: string; defaultPath: string }[]
  let opened: string[]
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-prompts-"))
    session = new ProjectSession()
    saveTo = null
    savePrompts = []
    opened = []
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      settings: new AppSettingsStore(join(dir, "settings.json")),
      migrationsFolder,
      dialogs: {
        pickDirectory: async () => null,
        pickFiles: async () => [],
        saveFile: async (options) => {
          savePrompts.push(options)
          return saveTo
        },
      },
      openPath: async (path: string) => {
        opened.push(path)
      },
      promptClient: () => ({}) as unknown as LlamaServerClient,
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

  /** A saved clip of two shots, each with something happening in it. */
  async function clipOfTwo(): Promise<number> {
    const clip = await caller.clips.create()
    await caller.clips.save({ id: clip.id, name: "Lighthouse" })
    const composition = await caller.clips.addShot({ clipId: clip.id })
    for (const [index, shot] of composition.shots.entries()) {
      await caller.clips.updateShot({
        shotId: shot.id,
        durationMs: shot.durationMs,
        cameraMotion: null,
        amplitude: null,
        speed: null,
        transition: null,
        lighting: null,
        soundNote: "",
        beats: [{ assetId: null, text: `something happens in shot ${index + 1}` }],
        things: [],
        dialogue: [],
      })
    }
    return clip.id
  }

  it("lists the targets the app can write for", async () => {
    const { targets, defaultId } = await caller.prompts.targets()

    expect(targets.map((target) => target.id)).toContain("minimax-h3")
    expect(defaultId).toBe("minimax-h3")
  })

  it("writes the prompt and its metadata into the project", async () => {
    await openProject()
    const clipId = await clipOfTwo()
    const prompt = await caller.clips.prompt({ clipId })

    const written = await caller.prompts.exportToProject({ clipId })

    expect(written.textPath).toContain(join(dir, "film", "exports", "prompts"))
    expect(prompt.ready).toBe(true)
    if (!prompt.ready) return
    expect(readFileSync(written.textPath, "utf8")).toBe(`${prompt.rendered}\n`)
    expect(JSON.parse(readFileSync(written.metaPath, "utf8"))).toEqual(
      expect.objectContaining({ target: "minimax-h3", clip: "Lighthouse" })
    )
  })

  it("saves the prompt where the dialog says", async () => {
    await openProject()
    const clipId = await clipOfTwo()
    saveTo = join(dir, "elsewhere", "my-prompt.txt")

    const written = await caller.prompts.exportToFile({ clipId })

    expect(savePrompts[0].defaultPath).toMatch(/^lighthouse-.*\.txt$/)
    expect(written?.textPath).toBe(saveTo)
    expect(readFileSync(join(dir, "elsewhere", "my-prompt.json"), "utf8")).toContain("minimax-h3")
  })

  it("writes nothing when the save dialog is cancelled", async () => {
    await openProject()
    const clipId = await clipOfTwo()

    expect(await caller.prompts.exportToFile({ clipId })).toBeNull()
  })

  it("makes the exports folder and asks the system to open it", async () => {
    await openProject()

    const { directory } = await caller.prompts.openExports()

    expect(directory).toBe(join(dir, "film", "exports", "prompts"))
    expect(existsSync(directory)).toBe(true)
    expect(opened).toEqual([directory])
  })

  it("refuses to export a clip still waiting for its picture", async () => {
    await openProject()
    const clipId = await clipOfTwo()
    const clip = await caller.clips.list()
    await caller.clips.update({ ...clip[0], id: clipId, form: "i2v" })

    await expect(caller.prompts.exportToProject({ clipId })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
  })

  it("refuses to export a clip that is not in the project", async () => {
    await openProject()

    await expect(caller.prompts.exportToProject({ clipId: 99 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })
})
