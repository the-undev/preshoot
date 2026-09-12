import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PromptServiceError } from "../../core/prompting/errors"
import type {
  ChatRequest,
  ChatResult,
  LlamaServerClient,
} from "../../core/prompting/llama-server-client"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

/** An answer covering `count` shots, keyed the way the instruction numbers them. */
function proseAnswer(count: number): string {
  return JSON.stringify({
    shots: Array.from({ length: count }, (_, index) => ({
      shot: index + 1,
      prose: `Shot ${index + 1} as written.`,
    })),
    overall_soundscape: "Wind batters the glass.",
    non_diegetic_music: "N/A",
  })
}

describe("prompts router", () => {
  let dir: string
  let session: ProjectSession
  let chat: (request: ChatRequest) => Promise<ChatResult>
  let requests: ChatRequest[]
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-prompts-"))
    session = new ProjectSession()
    requests = []
    chat = vi.fn(async () => ({ content: proseAnswer(2), model: "Qwen3.5-9B" }))
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      settings: new AppSettingsStore(join(dir, "settings.json")),
      migrationsFolder,
      dialogs: { pickDirectory: async () => null },
      promptClient: () =>
        ({
          chat: (request: ChatRequest) => {
            requests.push(request)
            return chat(request)
          },
        }) as unknown as LlamaServerClient,
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

  /** A clip of two shots, ready to write. */
  async function clipOfTwo(): Promise<{ clipId: number; shotIds: number[] }> {
    const clip = await caller.clips.create({ name: "Lighthouse" })
    await caller.clips.addShot({ clipId: clip.id })
    const composition = await caller.clips.addShot({ clipId: clip.id })
    return { clipId: clip.id, shotIds: composition.shots.map((shot) => shot.id) }
  }

  it("lists the ways a clip can be written", async () => {
    const { composers, defaultId } = await caller.prompts.composers()

    expect(composers.map((composer) => composer.id)).toEqual(["prose", "assembled", "brief"])
    expect(defaultId).toBe("prose")
  })

  it("writes a clip and keeps the composition and the prose", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()

    const generated = await caller.prompts.generate({ clipId, composerId: "prose" })

    expect(generated.composer).toBe("prose")
    expect(generated.clipId).toBe(clipId)
    expect(generated.model).toBe("Qwen3.5-9B")
    expect(generated.composition?.shots).toHaveLength(2)
    expect(generated.prose?.shots).toHaveLength(2)
    expect(generated.rendered).toContain("[Shot 1] Live-action, cinematic. Shot 1 as written.")
    expect(generated.rendered).toContain("[Shot 2] At 00:04.000, the camera cuts to")
  })

  it("writes a clip without the model when asked to assemble it", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()

    const generated = await caller.prompts.generate({ clipId, composerId: "assembled" })

    expect(generated.model).toBeNull()
    expect(requests).toEqual([])
  })

  it("lists what was generated for one clip only", async () => {
    await openProject()
    const first = await clipOfTwo()
    const second = await clipOfTwo()
    await caller.prompts.generate({ clipId: first.clipId, composerId: "prose" })

    expect(await caller.prompts.list({ clipId: first.clipId })).toHaveLength(1)
    expect(await caller.prompts.list({ clipId: second.clipId })).toEqual([])
  })

  it("refuses a clip with no shots", async () => {
    await openProject()
    const clip = await caller.clips.create({ name: "Empty" })

    await expect(caller.prompts.generate({ clipId: clip.id, composerId: "prose" })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
  })

  it("refuses to generate without an open project", async () => {
    await expect(caller.prompts.generate({ clipId: 1, composerId: "prose" })).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("passes on a server that cannot be reached, with its message", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    chat = vi.fn(async () => {
      throw PromptServiceError.unreachable("http://127.0.0.1:8080")
    })

    await expect(caller.prompts.generate({ clipId, composerId: "prose" })).rejects.toThrow(
      expect.objectContaining({
        code: "SERVICE_UNAVAILABLE",
        message: expect.stringContaining("http://127.0.0.1:8080"),
      })
    )
  })

  it("passes on an answer the app could not read as a bad gateway", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    chat = vi.fn(async () => ({ content: "not a prompt", model: "Qwen3.5-9B" }))

    await expect(caller.prompts.generate({ clipId, composerId: "prose" })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_GATEWAY" })
    )
  })

  it("rewrites one shot and keeps what was written for the others", async () => {
    await openProject()
    const { clipId, shotIds } = await clipOfTwo()
    const first = await caller.prompts.generate({ clipId, composerId: "prose" })
    chat = vi.fn(async () => ({
      content: JSON.stringify({
        shots: [{ shot: 2, prose: "Shot 2 written again." }],
        overall_soundscape: "Wind batters the glass.",
        non_diegetic_music: "N/A",
      }),
      model: "Qwen3.5-9B",
    }))

    const again = await caller.prompts.regenerateShot({
      generationId: first.id,
      shotId: shotIds[1],
    })

    expect(requests[1].user).toContain("Write shot 2 again, and only that shot")
    expect(again.prose?.shots).toEqual([
      { shotId: shotIds[0], prose: "Shot 1 as written." },
      { shotId: shotIds[1], prose: "Shot 2 written again." },
    ])
    expect(again.rendered).toContain("Shot 2 written again.")
  })

  it("refuses to rewrite a shot of a prompt that came from no clip", async () => {
    await openProject()
    const { clipId, shotIds } = await clipOfTwo()
    const generated = await caller.prompts.generate({ clipId, composerId: "prose" })
    await caller.clips.remove({ id: clipId })

    await expect(
      caller.prompts.regenerateShot({ generationId: generated.id, shotId: shotIds[0] })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })
})
