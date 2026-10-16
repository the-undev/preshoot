import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ComfyUiClient } from "../backend/comfyui-client"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import { fixtureText } from "../workflows/fixtures"
import { importWorkflow, type WorkflowDetail } from "../workflows/store"
import { pollRun, queueRun, savedSlotValues } from "./dispatch"
import { objectInfoFixture } from "./fixtures"
import { readRunPrompt } from "./run-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")
const baseUrl = "http://127.0.0.1:8188"
const now = new Date(2026, 2, 4, 5, 6, 7)

type Route = (url: URL, init: RequestInit) => Response

/** A ComfyUI that answers each path with its route, and records what it was asked. */
function fakeComfyUi(routes: Record<string, Route>): {
  client: ComfyUiClient
  calls: { path: string; init: RequestInit }[]
} {
  const calls: { path: string; init: RequestInit }[] = []
  const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input)
    calls.push({ path: url.pathname, init })
    const route = routes[url.pathname]
    if (!route) return new Response("not found", { status: 404 })
    return route(url, init)
  })
  return {
    client: new ComfyUiClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch }),
    calls,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

const objectInfo = objectInfoFixture()

describe("dispatch", () => {
  let dir: string
  let handle: ProjectDatabaseHandle
  let workflow: WorkflowDetail

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-dispatch-"))
    const folder = join(dir, "workflows")
    mkdirSync(folder)
    mkdirSync(join(dir, "outputs"))
    const sourcePath = join(folder, "h3-r2v-base.json")
    writeFileSync(sourcePath, fixtureText("h3-r2v-base"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
    workflow = importWorkflow(handle.db, { folder, sourcePath })
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function slotId(name: string): number {
    const slot = workflow.slots.find((entry) => entry.name === name)
    if (!slot) throw new Error(`no slot ${name}`)
    return slot.id
  }

  /** Routes that accept any prompt as `a1b2`, keeping what was posted. */
  function accepting(): { routes: Record<string, Route>; posted: () => unknown } {
    let body: unknown = null
    return {
      routes: {
        "/object_info": () => json(objectInfo),
        "/prompt": (_url, init) => {
          body = JSON.parse(init.body as string)
          return json({ prompt_id: "a1b2", number: 3, node_errors: {} })
        },
        "/upload/image": () => json({ name: "anna.png", subfolder: "preshoot", type: "input" }),
      },
      posted: () => body,
    }
  }

  async function queued(): Promise<number> {
    const { routes } = accepting()
    const { client } = fakeComfyUi(routes)
    const run = await queueRun({
      db: handle.db,
      client,
      workflowId: workflow.id,
      bindings: [],
      now,
    })
    return run.id
  }

  it("reads each slot's value as saved in the graph", () => {
    const values = new Map(
      savedSlotValues(handle.db, workflow.id).map((entry) => [entry.slotId, entry.value])
    )

    expect(values.get(slotId("Seed"))).toBe(757358688076805)
    expect(values.get(slotId("Turbo"))).toBe(false)
    expect(values.get(slotId("Picture 1"))).toBe("Qwen-Image-2512_00003_.png")
    expect(values.get(slotId("Steps"))).toBe(20)
    expect(values.get(slotId("Your LoRAs (LoRA Manager)"))).toBeNull()
  })

  it("queues the workflow with its bindings and records the run", async () => {
    const { routes, posted } = accepting()
    const { client } = fakeComfyUi(routes)

    const run = await queueRun({
      db: handle.db,
      client,
      workflowId: workflow.id,
      bindings: [
        { slotId: slotId("Prompt"), on: true, value: { type: "value", value: "A man walks in." } },
        { slotId: slotId("Seed"), on: true, value: { type: "value", value: 42 } },
      ],
      now,
    })

    const prompt = (posted() as { prompt: Record<string, { inputs: Record<string, unknown> }> })
      .prompt
    expect(prompt["14"].inputs).toEqual({ value: "A man walks in." })
    expect(prompt["23"].inputs).toEqual({ noise_seed: 42 })
    expect(run).toMatchObject({ promptId: "a1b2", state: "queued", seed: 42 })
    expect(run.bindings).toEqual([
      {
        slotId: slotId("Prompt"),
        slotName: "Prompt",
        on: true,
        value: "A man walks in.",
        file: null,
      },
      { slotId: slotId("Seed"), slotName: "Seed", on: true, value: 42, file: null },
    ])
    expect(JSON.parse(readRunPrompt(handle.db, run.id))).toEqual(prompt)
  })

  it("records the saved seed when the seed slot is not bound", async () => {
    const { routes } = accepting()
    const { client } = fakeComfyUi(routes)

    const run = await queueRun({
      db: handle.db,
      client,
      workflowId: workflow.id,
      bindings: [],
      now,
    })

    expect(run.seed).toBe(757358688076805)
  })

  it("sends a picked file and fills the slot with the name ComfyUI gave it", async () => {
    const picture = join(dir, "anna.png")
    writeFileSync(picture, Buffer.from([1, 2, 3]))
    const { routes, posted } = accepting()
    const { client, calls } = fakeComfyUi(routes)

    const run = await queueRun({
      db: handle.db,
      client,
      workflowId: workflow.id,
      bindings: [
        {
          slotId: slotId("Picture 3 (bypassed: Ctrl+B to use)"),
          on: true,
          value: { type: "file", path: picture },
        },
      ],
      now,
    })

    const upload = calls.find((call) => call.path === "/upload/image")
    expect((upload?.init.body as FormData).get("image")).toBeInstanceOf(Blob)
    const prompt = (posted() as { prompt: Record<string, { inputs: Record<string, unknown> }> })
      .prompt
    expect(prompt["12"].inputs).toEqual({ image: "preshoot/anna.png" })
    expect(run.bindings[0]).toMatchObject({ value: "preshoot/anna.png", file: picture })
  })

  it("refuses a file that cannot be read before anything is queued", async () => {
    const { routes } = accepting()
    const { client, calls } = fakeComfyUi(routes)

    await expect(
      queueRun({
        db: handle.db,
        client,
        workflowId: workflow.id,
        bindings: [
          {
            slotId: slotId("Picture 1"),
            on: true,
            value: { type: "file", path: join(dir, "gone.png") },
          },
        ],
        now,
      })
    ).rejects.toThrow(expect.objectContaining({ code: "unreadable-file" }))
    expect(calls.map((call) => call.path)).not.toContain("/prompt")
  })

  it("names the slot ComfyUI refused, and records nothing", async () => {
    const { client } = fakeComfyUi({
      "/object_info": () => json(objectInfo),
      "/prompt": () =>
        json(
          {
            error: {
              type: "prompt_outputs_failed_validation",
              message: "Prompt outputs failed validation",
            },
            node_errors: {
              "10": {
                errors: [{ message: "Value not in list", details: "image: 'gone.png'" }],
                class_type: "LoadImage",
              },
              "24": {
                errors: [{ message: "Required input is missing" }],
                class_type: "KSamplerSelect",
              },
            },
          },
          400
        ),
    })

    await expect(
      queueRun({ db: handle.db, client, workflowId: workflow.id, bindings: [], now })
    ).rejects.toThrow(
      "ComfyUI refused the run: Prompt outputs failed validation. Picture 1: Value not in list: image: 'gone.png'. KSamplerSelect (node 24): Required input is missing."
    )
  })

  it("refuses a slot the workflow does not have", async () => {
    const { routes } = accepting()
    const { client } = fakeComfyUi(routes)

    await expect(
      queueRun({
        db: handle.db,
        client,
        workflowId: workflow.id,
        bindings: [{ slotId: 999, on: true, value: null }],
        now,
      })
    ).rejects.toThrow(expect.objectContaining({ code: "not-found" }))
  })

  it("reports a waiting run with its place in the queue", async () => {
    const runId = await queued()
    const { client } = fakeComfyUi({
      "/queue": () =>
        json({
          queue_running: [[1, "other", {}, {}, []]],
          queue_pending: [
            [5, "a1b2", {}, {}, []],
            [4, "ahead", {}, {}, []],
          ],
        }),
    })

    const status = await pollRun({ db: handle.db, directory: dir, client, runId, now })

    expect(status.run.state).toBe("queued")
    expect(status.position).toBe(2)
  })

  it("reports a run ComfyUI is working on as running", async () => {
    const runId = await queued()
    const { client } = fakeComfyUi({
      "/queue": () => json({ queue_running: [[3, "a1b2", {}, {}, []]], queue_pending: [] }),
    })

    const status = await pollRun({ db: handle.db, directory: dir, client, runId, now })

    expect(status).toMatchObject({ run: { state: "running" }, position: null })
  })

  it("marks a run failed with the server's reason", async () => {
    const runId = await queued()
    const { client } = fakeComfyUi({
      "/queue": () => json({ queue_running: [], queue_pending: [] }),
      "/history/a1b2": () =>
        json({
          a1b2: {
            outputs: {},
            status: {
              status_str: "error",
              messages: [
                [
                  "execution_error",
                  {
                    node_id: "28",
                    node_type: "SamplerCustomAdvanced",
                    exception_message: "Out of memory",
                  },
                ],
              ],
            },
          },
        }),
    })

    const status = await pollRun({ db: handle.db, directory: dir, client, runId, now })

    expect(status.run).toMatchObject({
      state: "failed",
      error: "SamplerCustomAdvanced (node 28): Out of memory",
    })
  })

  it("marks a run ComfyUI has no record of as failed", async () => {
    const runId = await queued()
    const { client } = fakeComfyUi({
      "/queue": () => json({ queue_running: [], queue_pending: [] }),
      "/history/a1b2": () => json({}),
    })

    const status = await pollRun({ db: handle.db, directory: dir, client, runId, now })

    expect(status.run.state).toBe("failed")
    expect(status.run.error).toMatch(/no record of this run/)
  })

  describe("a finished run", () => {
    const finished = {
      "/queue": () => json({ queue_running: [], queue_pending: [] }),
      "/history/a1b2": () =>
        json({
          a1b2: {
            outputs: {
              "32": {
                images: [
                  { filename: "clip_00001_.mp4", subfolder: "video/2026-03-04", type: "output" },
                  { filename: "clip_00001_.mp4", subfolder: "video/other", type: "output" },
                ],
              },
            },
            status: { status_str: "success", messages: [] },
          },
        }),
    }

    it("copies its files into the project once and marks it done", async () => {
      const runId = await queued()
      const { client, calls } = fakeComfyUi({
        ...finished,
        "/view": (url) => new Response(url.searchParams.get("subfolder")),
      })

      const status = await pollRun({ db: handle.db, directory: dir, client, runId, now })
      const again = await pollRun({ db: handle.db, directory: dir, client, runId, now })

      expect(status.run.state).toBe("done")
      expect(status.run.outputs.map((output) => [output.path, output.sourceFilename])).toEqual([
        [`outputs/run-${runId}/clip_00001_.mp4`, "clip_00001_.mp4"],
        [`outputs/run-${runId}/clip_00001_-2.mp4`, "clip_00001_.mp4"],
      ])
      expect(readFileSync(join(dir, status.run.outputs[0].path), "utf8")).toBe("video/2026-03-04")
      expect(readFileSync(join(dir, status.run.outputs[1].path), "utf8")).toBe("video/other")
      expect(again.run).toEqual(status.run)
      expect(calls.filter((call) => call.path === "/view")).toHaveLength(2)
    })

    it("stays unfinished when a file cannot be copied, for the next poll to try again", async () => {
      const runId = await queued()
      const { client } = fakeComfyUi({
        ...finished,
        "/view": () => new Response("gone", { status: 404 }),
      })

      await expect(pollRun({ db: handle.db, directory: dir, client, runId, now })).rejects.toThrow(
        expect.objectContaining({ code: "bad-response" })
      )
      const { client: recovered } = fakeComfyUi({ ...finished, "/view": () => new Response("x") })
      const status = await pollRun({ db: handle.db, directory: dir, client: recovered, runId, now })

      expect(status.run.state).toBe("done")
      expect(existsSync(join(dir, `outputs/run-${runId}/clip_00001_.mp4.part`))).toBe(false)
    })
  })
})
