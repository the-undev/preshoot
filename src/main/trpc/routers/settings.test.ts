import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PromptServiceError } from "../../core/prompting/errors"
import type { LlamaServerClient } from "../../core/prompting/llama-server-client"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore, DEFAULT_LLAMA_SERVER_URL } from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("settings router", () => {
  let dir: string
  let session: ProjectSession
  let health: () => Promise<"ok" | "loading">
  let checkedUrl: string
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-settings-router-"))
    session = new ProjectSession()
    health = vi.fn(async () => "ok" as const)
    checkedUrl = ""
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      settings: new AppSettingsStore(join(dir, "settings.json")),
      migrationsFolder,
      dialogs: { pickDirectory: async () => null },
      promptClient: (baseUrl) => {
        checkedUrl = baseUrl
        return { health: () => health() } as unknown as LlamaServerClient
      },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it("starts on the default server URL", async () => {
    expect(await caller.settings.get()).toEqual({ llamaServerUrl: DEFAULT_LLAMA_SERVER_URL })
  })

  it("saves a new server URL and reads it back", async () => {
    await caller.settings.update({ llamaServerUrl: "http://192.168.1.20:9000" })

    expect(await caller.settings.get()).toEqual({ llamaServerUrl: "http://192.168.1.20:9000" })
  })

  it("rejects something that is not a URL", async () => {
    await expect(caller.settings.update({ llamaServerUrl: "localhost:8080" })).rejects.toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" })
    )
  })

  it("checks the URL it was given rather than the saved one", async () => {
    expect(await caller.settings.checkLlamaServer({ url: "http://192.168.1.20:9000" })).toBe("ok")
    expect(checkedUrl).toBe("http://192.168.1.20:9000")
  })

  it("reports a server that is still loading", async () => {
    health = vi.fn(async () => "loading" as const)

    expect(await caller.settings.checkLlamaServer({ url: DEFAULT_LLAMA_SERVER_URL })).toBe(
      "loading"
    )
  })

  it("reports a server that does not answer rather than failing", async () => {
    health = vi.fn(async () => {
      throw PromptServiceError.unreachable(DEFAULT_LLAMA_SERVER_URL)
    })

    expect(await caller.settings.checkLlamaServer({ url: DEFAULT_LLAMA_SERVER_URL })).toBe(
      "unreachable"
    )
  })
})
