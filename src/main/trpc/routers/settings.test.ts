import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ComfyUiClient, ComfyUiStatus } from "../../core/backend/comfyui-client"
import { PromptServiceError } from "../../core/prompting/errors"
import type { LlamaServerClient, ServerModel } from "../../core/prompting/llama-server-client"
import { ClipHistory } from "../../core/composition/history"
import { ProjectSession } from "../../core/projects/session"
import {
  AppSettingsStore,
  DEFAULT_COMFYUI_URL,
  DEFAULT_LLAMA_SERVER_URL,
} from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("settings router", () => {
  let dir: string
  let session: ProjectSession
  let health: () => Promise<"ok" | "loading">
  let models: () => Promise<ServerModel[]>
  let unloaded: string[]
  let checkedUrl: string
  let comfyUiStatus: () => Promise<ComfyUiStatus>
  let checkedComfyUiUrl: string
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-settings-router-"))
    session = new ProjectSession()
    health = vi.fn(async () => "ok" as const)
    models = vi.fn(async () => [
      { id: "qwen", state: "loaded" as const, modalities: ["text", "image"] },
      { id: "other", state: "unloaded" as const, modalities: ["text"] },
    ])
    unloaded = []
    checkedUrl = ""
    comfyUiStatus = vi.fn(async () => ({ state: "reachable" as const, version: "0.39.2" }))
    checkedComfyUiUrl = ""
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      history: new ClipHistory(),
      settings: new AppSettingsStore(join(dir, "settings.json")),
      migrationsFolder,
      dialogs: {
        pickDirectory: async () => null,
        pickFiles: async () => [],
        saveFile: async () => null,
      },
      openPath: async () => {},
      promptClient: (baseUrl) => {
        checkedUrl = baseUrl
        return {
          health: () => health(),
          models: () => models(),
          unload: async (id: string) => {
            unloaded.push(id)
          },
        } as unknown as LlamaServerClient
      },
      comfyUiClient: (baseUrl) => {
        checkedComfyUiUrl = baseUrl
        return { status: () => comfyUiStatus() } as unknown as ComfyUiClient
      },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it("starts on the default server URLs and no model", async () => {
    expect(await caller.settings.get()).toEqual({
      llamaServerUrl: DEFAULT_LLAMA_SERVER_URL,
      llamaModel: "",
      comfyUiUrl: DEFAULT_COMFYUI_URL,
    })
  })

  it("saves the server URLs and a model and reads them back", async () => {
    await caller.settings.update({
      llamaServerUrl: "http://192.168.1.20:9000",
      llamaModel: "qwen",
      comfyUiUrl: "http://127.0.0.1:8190",
    })

    expect(await caller.settings.get()).toEqual({
      llamaServerUrl: "http://192.168.1.20:9000",
      llamaModel: "qwen",
      comfyUiUrl: "http://127.0.0.1:8190",
    })
  })

  it("rejects something that is not a URL", async () => {
    await expect(
      caller.settings.update({
        llamaServerUrl: "localhost:8080",
        llamaModel: "",
        comfyUiUrl: DEFAULT_COMFYUI_URL,
      })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("rejects a ComfyUI URL without a scheme", async () => {
    await expect(
      caller.settings.update({
        llamaServerUrl: DEFAULT_LLAMA_SERVER_URL,
        llamaModel: "",
        comfyUiUrl: "localhost:8188",
      })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("asks the saved ComfyUI for its status", async () => {
    await caller.settings.update({
      llamaServerUrl: DEFAULT_LLAMA_SERVER_URL,
      llamaModel: "",
      comfyUiUrl: "http://127.0.0.1:8190",
    })

    expect(await caller.settings.comfyUiStatus()).toEqual({
      state: "reachable",
      version: "0.39.2",
    })
    expect(checkedComfyUiUrl).toBe("http://127.0.0.1:8190")
  })

  it("checks the ComfyUI URL it was given rather than the saved one", async () => {
    comfyUiStatus = vi.fn(async () => ({ state: "unreachable" as const }))

    expect(await caller.settings.checkComfyUi({ url: "http://192.168.1.30:8188" })).toEqual({
      state: "unreachable",
    })
    expect(checkedComfyUiUrl).toBe("http://192.168.1.30:8188")
  })

  it("checks the URL it was given rather than the saved one", async () => {
    const report = await caller.settings.checkLlamaServer({ url: "http://192.168.1.20:9000" })

    expect(report.state).toBe("ok")
    expect(report.models.map((model) => model.id)).toEqual(["qwen", "other"])
    expect(checkedUrl).toBe("http://192.168.1.20:9000")
  })

  it("asks a server that is still loading for no models", async () => {
    health = vi.fn(async () => "loading" as const)

    expect(await caller.settings.checkLlamaServer({ url: DEFAULT_LLAMA_SERVER_URL })).toEqual({
      state: "loading",
      models: [],
    })
  })

  it("reports a server that does not answer rather than failing", async () => {
    health = vi.fn(async () => {
      throw PromptServiceError.unreachable(DEFAULT_LLAMA_SERVER_URL)
    })

    expect(await caller.settings.checkLlamaServer({ url: DEFAULT_LLAMA_SERVER_URL })).toEqual({
      state: "unreachable",
      models: [],
    })
  })

  it("frees a model and says what the server has left", async () => {
    const left = await caller.settings.unloadModel({
      url: DEFAULT_LLAMA_SERVER_URL,
      modelId: "qwen",
    })

    expect(unloaded).toEqual(["qwen"])
    expect(left.models.map((model) => model.id)).toEqual(["qwen", "other"])
  })
})
