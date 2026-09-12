import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
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

/** Settings with a model chosen, since writing with a model refuses without one. */
function settingsWithModel(path: string): AppSettingsStore {
  const settings = new AppSettingsStore(path)
  settings.setLlamaModel("Qwen3.5-9B")
  return settings
}

/** An answer covering `count` shots, keyed the way the instruction numbers them. */
function proseAnswer(count: number): string {
  return JSON.stringify({
    shots: Array.from({ length: count }, (_, index) => ({
      shot: index + 1,
      prose:
        index === 0 ? "Shot 1 as written." : `the camera cuts to shot ${index + 1} as written.`,
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
  let saveTo: string | null
  let savePrompts: { title: string; defaultPath: string }[]
  let opened: string[]
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-prompts-"))
    session = new ProjectSession()
    requests = []
    saveTo = null
    savePrompts = []
    opened = []
    chat = vi.fn(async () => ({ content: proseAnswer(2), model: "Qwen3.5-9B" }))
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      settings: settingsWithModel(join(dir, "settings.json")),
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

    const generated = await caller.prompts.generate({
      clipId,
      composerId: "prose",
      variantId: null,
    })

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

    const generated = await caller.prompts.generate({
      clipId,
      composerId: "assembled",
      variantId: null,
    })

    expect(generated.model).toBeNull()
    expect(requests).toEqual([])
  })

  it("lists what was generated for one clip only", async () => {
    await openProject()
    const first = await clipOfTwo()
    const second = await clipOfTwo()
    await caller.prompts.generate({ clipId: first.clipId, composerId: "prose", variantId: null })

    expect(await caller.prompts.list({ clipId: first.clipId })).toHaveLength(1)
    expect(await caller.prompts.list({ clipId: second.clipId })).toEqual([])
  })

  it("refuses a clip whose only shot has been taken away", async () => {
    await openProject()
    const clip = await caller.clips.create({ name: "Empty" })
    const composition = await caller.clips.composition({ clipId: clip.id })
    await caller.clips.removeShot({ shotId: composition.shots[0].id })

    await expect(
      caller.prompts.generate({ clipId: clip.id, composerId: "prose", variantId: null })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("refuses to generate without an open project", async () => {
    await expect(
      caller.prompts.generate({ clipId: 1, composerId: "prose", variantId: null })
    ).rejects.toThrow(expect.objectContaining({ code: "PRECONDITION_FAILED" }))
  })

  it("passes on a server that cannot be reached, with its message", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    chat = vi.fn(async () => {
      throw PromptServiceError.unreachable("http://127.0.0.1:8080")
    })

    await expect(
      caller.prompts.generate({ clipId, composerId: "prose", variantId: null })
    ).rejects.toThrow(
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

    await expect(
      caller.prompts.generate({ clipId, composerId: "prose", variantId: null })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_GATEWAY" }))
  })

  it("rewrites one shot and keeps what was written for the others", async () => {
    await openProject()
    const { clipId, shotIds } = await clipOfTwo()
    const first = await caller.prompts.generate({ clipId, composerId: "prose", variantId: null })
    chat = vi.fn(async () => ({
      content: JSON.stringify({
        shots: [{ shot: 2, prose: "the camera cuts to shot 2 written again." }],
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
      { shotId: shotIds[1], prose: "the camera cuts to shot 2 written again." },
    ])
    expect(again.rendered).toContain("shot 2 written again.")
  })

  it("records the prompt it wrote with and the text of it", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()

    const generated = await caller.prompts.generate({
      clipId,
      composerId: "prose",
      variantId: null,
    })

    expect(generated.promptVariantId).toBe("builtin:minimax-h3:prose")
    expect(generated.systemPrompt).toContain("MiniMax H3")
    expect(requests[0].system).toBe(generated.systemPrompt)
  })

  it("writes with a prompt stored in the project", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const variant = await caller.prompts.saveVariant({
      id: null,
      targetId: "minimax-h3",
      strategy: "prose",
      name: "Terser",
      systemPrompt: "Write it shorter.",
    })

    const generated = await caller.prompts.generate({
      clipId,
      composerId: "prose",
      variantId: variant.id,
    })

    expect(requests[0].system).toBe("Write it shorter.")
    expect(generated.promptVariantId).toBe(variant.id)
  })

  it("lists the prompts that can write for a target", async () => {
    await openProject()
    await caller.prompts.saveVariant({
      id: null,
      targetId: "minimax-h3",
      strategy: "prose",
      name: "Terser",
      systemPrompt: "Write it shorter.",
    })

    const variants = await caller.prompts.variants({ targetId: "minimax-h3" })

    expect(variants.map((variant) => variant.name)).toEqual([
      "Built-in, prose per shot",
      "Built-in, brief only",
      "Built-in, editing",
      "Terser",
    ])
  })

  it("refuses to write when no model has been chosen", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    new AppSettingsStore(join(dir, "settings.json")).setLlamaModel("")

    await expect(
      caller.prompts.generate({ clipId, composerId: "prose", variantId: null })
    ).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST", message: expect.stringContaining("settings") })
    )
  })

  it("assembles without a model even when none is chosen", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    new AppSettingsStore(join(dir, "settings.json")).setLlamaModel("")

    const generated = await caller.prompts.generate({
      clipId,
      composerId: "assembled",
      variantId: null,
    })

    expect(generated.model).toBeNull()
  })

  it("writes a clip several ways under one run", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()

    const run = await caller.prompts.compare({
      clipId,
      runs: [
        { composerId: "prose", variantId: null },
        { composerId: "assembled", variantId: null },
      ],
    })

    expect(run.results).toHaveLength(2)
    expect(run.results[0].composer).toBe("prose")
    expect(run.results[1].composer).toBe("assembled")
    expect(run.results[0].runId).toBe(run.runId)
    expect(run.failure).toBeNull()
  })

  it("lists the runs a clip has, newest first, with what was liked", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const first = await caller.prompts.compare({
      clipId,
      runs: [
        { composerId: "assembled", variantId: null },
        { composerId: "assembled", variantId: null },
      ],
    })
    await caller.prompts.setVerdict({ generationId: first.results[0].id, verdict: "good" })
    const second = await caller.prompts.compare({
      clipId,
      runs: [
        { composerId: "assembled", variantId: null },
        { composerId: "assembled", variantId: null },
      ],
    })

    const runs = await caller.prompts.runs({ clipId })

    expect(runs.map((run) => run.runId)).toEqual([second.runId, first.runId])
    expect(runs[1]).toEqual(expect.objectContaining({ written: 2, good: 1 }))
    expect(await caller.prompts.run({ runId: first.runId })).toHaveLength(2)
  })

  it("keeps what landed when a later way of writing fails, and says which", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    chat = vi.fn(async () => ({ content: "not a prompt", model: "Qwen3.5-9B" }))

    const run = await caller.prompts.compare({
      clipId,
      runs: [
        { composerId: "assembled", variantId: null },
        { composerId: "prose", variantId: null },
      ],
    })

    expect(run.results).toHaveLength(1)
    expect(run.failure?.composerId).toBe("prose")
    expect(run.failure?.message).toContain("could not read")
    expect(await caller.prompts.list({ clipId })).toHaveLength(1)
  })

  it("marks a result without writing over its note", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const generated = await caller.prompts.generate({
      clipId,
      composerId: "prose",
      variantId: null,
    })
    await caller.prompts.setNote({
      generationId: generated.id,
      note: "Kept the voice across the cut.",
    })

    const judged = await caller.prompts.setVerdict({ generationId: generated.id, verdict: "good" })

    expect(judged.verdict).toBe("good")
    expect(judged.note).toBe("Kept the voice across the cut.")
  })

  it("writes a note without clearing the verdict", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const generated = await caller.prompts.generate({
      clipId,
      composerId: "prose",
      variantId: null,
    })
    await caller.prompts.setVerdict({ generationId: generated.id, verdict: "bad" })

    const noted = await caller.prompts.setNote({
      generationId: generated.id,
      note: "Lost the keeper between shots.",
    })

    expect(noted.verdict).toBe("bad")
    expect(noted.note).toBe("Lost the keeper between shots.")
  })

  it("rewrites a prompt and keeps what it came from", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const first = await caller.prompts.generate({ clipId, composerId: "prose", variantId: null })
    chat = vi.fn(async () => ({
      content: JSON.stringify({
        integrated_multimodal_description: "[Shot 1] Live-action, cinematic. She is smiling.",
        overall_soundscape: "Traffic passes.",
        non_diegetic_music: "N/A",
      }),
      model: "Qwen3.5-9B",
    }))

    const edited = await caller.prompts.edit({
      generationId: first.id,
      instruction: "She is happier.",
      variantId: null,
    })

    expect(edited.composer).toBe("edit")
    expect(edited.parentId).toBe(first.id)
    expect(edited.editInstruction).toBe("She is happier.")
    expect(edited.clipId).toBe(clipId)
    expect(edited.promptVariantId).toBe("builtin:minimax-h3:edit")
    expect(edited.rendered).toContain("She is smiling.")
    expect(requests[1].user).toContain(first.fields.integrated_multimodal_description)
    expect(requests[1].user).toContain("She is happier.")
  })

  it("edits an edit, keeping the chain", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const first = await caller.prompts.generate({ clipId, composerId: "prose", variantId: null })
    chat = vi.fn(async () => ({
      content: JSON.stringify({
        integrated_multimodal_description: "[Shot 1] Live-action, cinematic. She is smiling.",
        overall_soundscape: "Traffic passes.",
        non_diegetic_music: "N/A",
      }),
      model: "Qwen3.5-9B",
    }))
    const once = await caller.prompts.edit({
      generationId: first.id,
      instruction: "She is happier.",
      variantId: null,
    })

    const twice = await caller.prompts.edit({
      generationId: once.id,
      instruction: "Faster.",
      variantId: null,
    })

    expect(twice.parentId).toBe(once.id)
    expect((await caller.prompts.list({ clipId })).map((entry) => entry.parentId)).toEqual([
      once.id,
      first.id,
      null,
    ])
  })

  it("refuses an edit with nothing asked for", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const first = await caller.prompts.generate({ clipId, composerId: "prose", variantId: null })

    await expect(
      caller.prompts.edit({ generationId: first.id, instruction: "   ", variantId: null })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("refuses to edit a prompt that is not in the project", async () => {
    await openProject()

    await expect(
      caller.prompts.edit({ generationId: 99, instruction: "Faster.", variantId: null })
    ).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }))
  })

  it("writes the prompt and its metadata into the project", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const generated = await caller.prompts.generate({
      clipId,
      composerId: "prose",
      variantId: null,
    })

    const written = await caller.prompts.exportToProject({ generationId: generated.id })

    expect(written.textPath).toContain(join(dir, "film", "exports", "prompts"))
    expect(readFileSync(written.textPath, "utf8")).toBe(`${generated.rendered}\n`)
    expect(JSON.parse(readFileSync(written.metaPath, "utf8"))).toEqual(
      expect.objectContaining({ composer: "prose", model: "Qwen3.5-9B" })
    )
  })

  it("saves the prompt where the dialog says", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const generated = await caller.prompts.generate({
      clipId,
      composerId: "prose",
      variantId: null,
    })
    saveTo = join(dir, "elsewhere", "my-prompt.txt")

    const written = await caller.prompts.exportToFile({ generationId: generated.id })

    expect(savePrompts[0].defaultPath).toMatch(/^lighthouse-.*\.txt$/)
    expect(written?.textPath).toBe(saveTo)
    expect(readFileSync(join(dir, "elsewhere", "my-prompt.json"), "utf8")).toContain("prose")
  })

  it("writes nothing when the save dialog is cancelled", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    const generated = await caller.prompts.generate({
      clipId,
      composerId: "prose",
      variantId: null,
    })

    expect(await caller.prompts.exportToFile({ generationId: generated.id })).toBeNull()
  })

  it("makes the exports folder and asks the system to open it", async () => {
    await openProject()

    const { directory } = await caller.prompts.openExports()

    expect(directory).toBe(join(dir, "film", "exports", "prompts"))
    expect(existsSync(directory)).toBe(true)
    expect(opened).toEqual([directory])
  })

  it("refuses to export a prompt that is not in the project", async () => {
    await openProject()

    await expect(caller.prompts.exportToProject({ generationId: 99 })).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    )
  })

  it("takes a clip's prompts with it when the clip goes", async () => {
    await openProject()
    const { clipId } = await clipOfTwo()
    await caller.prompts.generate({ clipId, composerId: "prose", variantId: null })
    await caller.prompts.generate({ clipId, composerId: "assembled", variantId: null })

    expect(await caller.clips.remove({ id: clipId })).toEqual({ prompts: 2 })
    await expect(caller.prompts.list({ clipId })).resolves.toEqual([])
  })
})
