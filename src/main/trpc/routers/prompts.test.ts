import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PromptServiceError } from "../../core/prompting/errors"
import type { ChatResult, LlamaServerClient } from "../../core/prompting/llama-server-client"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

const fields = {
  integrated_multimodal_description: "[Shot 1] Live-action, a baker opens the shutters.",
  overall_soundscape: "Wooden shutters scrape open over a quiet street.",
  non_diegetic_music: "A soft acoustic-guitar pattern at a moderate tempo.",
}

describe("prompts router", () => {
  let dir: string
  let session: ProjectSession
  let chat: () => Promise<ChatResult>
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-prompts-"))
    session = new ProjectSession()
    chat = vi.fn(async () => ({ content: JSON.stringify(fields), model: "Qwen3.5-9B" }))
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      settings: new AppSettingsStore(join(dir, "settings.json")),
      migrationsFolder,
      dialogs: { pickDirectory: async () => null },
      promptClient: () => ({ chat: () => chat() }) as unknown as LlamaServerClient,
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

  it("stores the generated prompt and returns it", async () => {
    await openProject()

    const generated = await caller.prompts.generate({ brief: "A baker opens the shutters." })

    expect(generated.id).toBeGreaterThan(0)
    expect(generated.target).toBe("minimax-h3")
    expect(generated.brief).toBe("A baker opens the shutters.")
    expect(generated.fields).toEqual(fields)
    expect(generated.model).toBe("Qwen3.5-9B")
    expect(generated.rendered).toContain("overall_soundscape: Wooden shutters")
  })

  it("lists what it has generated, newest first", async () => {
    await openProject()
    await caller.prompts.generate({ brief: "First brief." })
    await caller.prompts.generate({ brief: "Second brief." })

    expect((await caller.prompts.list()).map((entry) => entry.brief)).toEqual([
      "Second brief.",
      "First brief.",
    ])
  })

  it("lists nothing in a project that has generated nothing", async () => {
    await openProject()

    expect(await caller.prompts.list()).toEqual([])
  })

  it("refuses to generate without an open project", async () => {
    await expect(caller.prompts.generate({ brief: "A baker." })).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("refuses to list without an open project", async () => {
    await expect(caller.prompts.list()).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("rejects an empty brief", async () => {
    await openProject()

    await expect(caller.prompts.generate({ brief: "   " })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
  })

  it("passes on a server that cannot be reached, with its message", async () => {
    await openProject()
    chat = vi.fn(async () => {
      throw PromptServiceError.unreachable("http://127.0.0.1:8080")
    })

    await expect(caller.prompts.generate({ brief: "A baker." })).rejects.toThrow(
      expect.objectContaining({
        code: "SERVICE_UNAVAILABLE",
        message: expect.stringContaining("http://127.0.0.1:8080"),
      })
    )
  })

  it("passes on an answer the app could not read as a bad gateway", async () => {
    await openProject()
    chat = vi.fn(async () => ({ content: "not a prompt", model: "Qwen3.5-9B" }))

    await expect(caller.prompts.generate({ brief: "A baker." })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_GATEWAY" })
    )
  })
})
