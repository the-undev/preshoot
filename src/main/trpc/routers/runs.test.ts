import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ComfyUiClient } from "../../core/backend/comfyui-client"
import { ClipHistory } from "../../core/composition/history"
import { objectInfoFixture } from "../../core/dispatch/fixtures"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import { fixtureText } from "../../core/workflows/fixtures"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

type Route = (url: URL, init: RequestInit) => Response

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

/** What a ComfyUI that takes every prompt and finishes it at once answers. */
const finishingRoutes: Record<string, Route> = {
  "/object_info": () => json(objectInfoFixture()),
  "/prompt": () => json({ prompt_id: "a1b2", number: 1, node_errors: {} }),
  "/queue": () => json({ queue_running: [], queue_pending: [] }),
  "/history/a1b2": () =>
    json({
      a1b2: {
        outputs: {
          "32": { images: [{ filename: "clip.mp4", subfolder: "video", type: "output" }] },
        },
        status: { status_str: "success", messages: [] },
      },
    }),
  "/view": () => new Response("video bytes"),
}

describe("runs router", () => {
  let dir: string
  let folder: string
  let session: ProjectSession
  let settings: AppSettingsStore
  let routes: Record<string, Route>
  let comfyUiUrls: string[]
  let opened: string[]
  let picked: Parameters<Context["dialogs"]["pickFiles"]>[0][]
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-runs-router-"))
    folder = join(dir, "workflows")
    mkdirSync(folder)
    writeFileSync(join(folder, "h3-r2v-base.json"), fixtureText("h3-r2v-base"))
    session = new ProjectSession()
    settings = new AppSettingsStore(join(dir, "settings.json"))
    settings.setWorkflowsFolder(folder)
    routes = { ...finishingRoutes }
    comfyUiUrls = []
    opened = []
    picked = []
    const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      const route = routes[url.pathname]
      return route ? route(url, init) : new Response("not found", { status: 404 })
    })
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      history: new ClipHistory(),
      settings,
      migrationsFolder,
      dialogs: {
        pickDirectory: async () => null,
        pickFiles: async (options) => {
          picked.push(options)
          return ["/pictures/anna.png", "/pictures/other.png"]
        },
        saveFile: async () => null,
      },
      openPath: async (path) => {
        opened.push(path)
      },
      promptClient: () => {
        throw new Error("the runs router does not generate prompts")
      },
      comfyUiClient: (baseUrl) => {
        comfyUiUrls.push(baseUrl)
        return new ComfyUiClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch })
      },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function openProjectWithWorkflow(): Promise<
    Awaited<ReturnType<typeof caller.workflows.import>>
  > {
    await caller.projects.create({
      directory: join(dir, "film"),
      name: "Film",
      createDirectory: false,
      allowNonEmpty: false,
    })
    return caller.workflows.import({ path: join(folder, "h3-r2v-base.json") })
  }

  it("asks for a project before listing runs", async () => {
    await expect(caller.runs.list({ workflowId: 1 })).rejects.toThrow(
      expect.objectContaining({ code: "PRECONDITION_FAILED" })
    )
  })

  it("gives the value each slot holds as saved", async () => {
    const workflow = await openProjectWithWorkflow()
    const seed = workflow.slots.find((slot) => slot.name === "Seed")

    const values = await caller.runs.values({ workflowId: workflow.id })

    expect(values.find((entry) => entry.slotId === seed?.id)?.value).toBe(757358688076805)
  })

  it("queues a run on the saved ComfyUI, follows it, and opens its output", async () => {
    const workflow = await openProjectWithWorkflow()
    settings.setComfyUiUrl("http://127.0.0.1:8190")
    const prompt = workflow.slots.find((slot) => slot.name === "Prompt")
    if (!prompt) throw new Error("no prompt slot")

    const [run] = await caller.runs.queue({
      workflowId: workflow.id,
      bindings: [{ slotId: prompt.id, on: true, value: { type: "value", value: "Hello." } }],
    })
    expect(run.state).toBe("queued")
    expect(comfyUiUrls).toEqual(["http://127.0.0.1:8190"])

    const [status] = await caller.runs.poll({ workflowId: workflow.id })
    expect(status.run.state).toBe("done")
    const [output] = status.run.outputs
    expect(readFileSync(join(dir, "film", output.path), "utf8")).toBe("video bytes")

    expect((await caller.runs.list({ workflowId: workflow.id })).map((entry) => entry.id)).toEqual([
      run.id,
    ])
    await caller.runs.openOutput({ outputId: output.id })
    expect(opened).toEqual([join(dir, "film", output.path)])
  })

  it("queues a batch with a fresh seed in each run after the first, from a configuration", async () => {
    const workflow = await openProjectWithWorkflow()
    const seed = workflow.slots.find((slot) => slot.name === "Seed")
    if (!seed) throw new Error("no seed slot")
    const configuration = await caller.configurations.save({
      workflowId: workflow.id,
      name: "Anna",
      bindings: [],
    })

    const runs = await caller.runs.queue({
      workflowId: workflow.id,
      bindings: [{ slotId: seed.id, on: true, value: { type: "value", value: 42 } }],
      configurationId: configuration.id,
      count: 3,
    })

    expect(runs).toHaveLength(3)
    expect(runs[0].seed).toBe(42)
    expect(new Set(runs.map((run) => run.seed)).size).toBe(3)
    expect(runs.map((run) => run.configurationName)).toEqual(["Anna", "Anna", "Anna"])
    expect(await caller.runs.list({ workflowId: workflow.id })).toHaveLength(3)
  })

  it("cancels a waiting run on the saved ComfyUI and records it failed", async () => {
    const workflow = await openProjectWithWorkflow()
    settings.setComfyUiUrl("http://127.0.0.1:8190")
    const [run] = await caller.runs.queue({ workflowId: workflow.id, bindings: [] })
    const deleted: unknown[] = []
    routes["/queue"] = (_url, init) => {
      if (init.method !== "POST") {
        return json({ queue_running: [], queue_pending: [[1, "a1b2", {}, {}, []]] })
      }
      deleted.push(JSON.parse(init.body as string))
      return new Response(null, { status: 200 })
    }

    const cancelled = await caller.runs.cancel({ runId: run.id })

    expect(cancelled).toMatchObject({ id: run.id, state: "failed", error: "Cancelled." })
    expect(deleted).toEqual([{ delete: ["a1b2"] }])
    expect(comfyUiUrls).toEqual(["http://127.0.0.1:8190", "http://127.0.0.1:8190"])
  })

  it("reports a run with nothing to cancel as a conflict", async () => {
    const workflow = await openProjectWithWorkflow()
    const [run] = await caller.runs.queue({ workflowId: workflow.id, bindings: [] })

    await expect(caller.runs.cancel({ runId: run.id })).rejects.toThrow(
      expect.objectContaining({
        code: "CONFLICT",
        message: `Run ${run.id} is neither waiting nor running in ComfyUI, so there was nothing to cancel.`,
      })
    )
  })

  it("refuses a batch larger than twenty", async () => {
    const workflow = await openProjectWithWorkflow()

    await expect(
      caller.runs.queue({ workflowId: workflow.id, bindings: [], count: 21 })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("passes ComfyUI's refusal on as a bad request", async () => {
    const workflow = await openProjectWithWorkflow()
    routes["/prompt"] = () =>
      json({ error: { message: "Prompt has no outputs" }, node_errors: {} }, 400)

    await expect(caller.runs.queue({ workflowId: workflow.id, bindings: [] })).rejects.toThrow(
      expect.objectContaining({
        code: "BAD_REQUEST",
        message: "ComfyUI refused the run: Prompt has no outputs.",
      })
    )
  })

  it("reports a ComfyUI that does not answer as unavailable", async () => {
    const workflow = await openProjectWithWorkflow()
    routes["/object_info"] = () => {
      throw new TypeError("fetch failed")
    }

    await expect(caller.runs.queue({ workflowId: workflow.id, bindings: [] })).rejects.toThrow(
      expect.objectContaining({ code: "SERVICE_UNAVAILABLE" })
    )
  })

  it("reports a slot the workflow does not have as not found", async () => {
    const workflow = await openProjectWithWorkflow()

    await expect(
      caller.runs.queue({
        workflowId: workflow.id,
        bindings: [{ slotId: 999, on: true, value: null }],
      })
    ).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }))
  })

  it("refuses a binding that is neither a value nor a file", async () => {
    const workflow = await openProjectWithWorkflow()

    await expect(
      caller.runs.queue({
        workflowId: workflow.id,
        bindings: [{ slotId: 1, on: true, value: { type: "library", id: 3 } as never }],
      })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("picks one file of the kind the slot takes", async () => {
    expect(await caller.runs.pickFile({ kind: "audio" })).toBe("/pictures/anna.png")
    expect(picked[0]).toMatchObject({ filterName: "Sound", multiple: false })
    expect(picked[0].extensions).toContain("wav")
  })
})
