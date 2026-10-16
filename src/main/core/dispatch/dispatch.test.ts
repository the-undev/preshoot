import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ComfyUiClient } from "../backend/comfyui-client"
import { openProjectDatabase, schema, type ProjectDatabaseHandle } from "../db"
import { fixtureText } from "../workflows/fixtures"
import { importWorkflow, type WorkflowDetail } from "../workflows/store"
import { cancelRun, pollRuns, queueBatch, savedSlotValues, type RunStatus } from "./dispatch"
import { objectInfoFixture } from "./fixtures"
import { readRun, readRunPrompt, type RunRecord } from "./run-store"

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

  /** Queues one run through the batch path, which is the only way in. */
  async function queueOneRun(
    input: Omit<Parameters<typeof queueBatch>[0], "count" | "randomSeed">
  ): Promise<RunRecord> {
    const [run] = await queueBatch({ ...input, count: 1, randomSeed: () => 1 })
    return run
  }

  /** Polls the workflow's unfinished runs and gives what the poll found for `runId`. */
  async function polled(client: ComfyUiClient, runId: number): Promise<RunStatus> {
    const statuses = await pollRuns({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      now,
    })
    const status = statuses.find((entry) => entry.run.id === runId)
    if (!status) throw new Error(`the poll did not find run ${runId}`)
    return status
  }

  async function queued(): Promise<number> {
    const { routes } = accepting()
    const { client } = fakeComfyUi(routes)
    const run = await queueOneRun({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      configurationId: null,
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

    const run = await queueOneRun({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      configurationId: null,
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

    const run = await queueOneRun({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      configurationId: null,
      bindings: [],
      now,
    })

    expect(run.seed).toBe(757358688076805)
  })

  it("records no seed when the seed slot is switched off", async () => {
    const { routes } = accepting()
    const { client } = fakeComfyUi(routes)

    const run = await queueOneRun({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      configurationId: null,
      bindings: [{ slotId: slotId("Seed"), on: false, value: { type: "value", value: 42 } }],
      now,
    })

    expect(run.seed).toBeNull()
  })

  it("neither reads nor sends the file of a slot that is off", async () => {
    const { routes } = accepting()
    const { client, calls } = fakeComfyUi(routes)
    const gone = join(dir, "gone.png")

    const run = await queueOneRun({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      configurationId: null,
      bindings: [
        {
          slotId: slotId("Picture 3 (bypassed: Ctrl+B to use)"),
          on: false,
          value: { type: "file", path: gone },
        },
      ],
      now,
    })

    expect(calls.map((call) => call.path)).not.toContain("/upload/image")
    expect(run.bindings[0]).toMatchObject({ on: false, value: null, file: "gone.png" })
  })

  it("sends a picked file and fills the slot with the name ComfyUI gave it", async () => {
    const picture = join(dir, "anna.png")
    writeFileSync(picture, Buffer.from([1, 2, 3]))
    const { routes, posted } = accepting()
    const { client, calls } = fakeComfyUi(routes)

    const run = await queueOneRun({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      configurationId: null,
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
    expect(run.bindings[0]).toMatchObject({ value: "preshoot/anna.png", file: "anna.png" })
  })

  it("records a file under the project by its project path, and any other in full", async () => {
    mkdirSync(join(dir, "inputs"))
    const copied = join(dir, "inputs", "anna.png")
    writeFileSync(copied, Buffer.from([1, 2, 3]))
    const elsewhere = mkdtempSync(join(tmpdir(), "preshoot-elsewhere-"))
    const outside = join(elsewhere, "bea.png")
    writeFileSync(outside, Buffer.from([4, 5]))
    const { routes } = accepting()
    const { client, calls } = fakeComfyUi(routes)

    try {
      const run = await queueOneRun({
        db: handle.db,
        directory: dir,
        client,
        workflowId: workflow.id,
        configurationId: null,
        bindings: [
          { slotId: slotId("Picture 1"), on: true, value: { type: "file", path: copied } },
          { slotId: slotId("Picture 2"), on: true, value: { type: "file", path: outside } },
        ],
        now,
      })

      expect(calls.filter((call) => call.path === "/upload/image")).toHaveLength(2)
      expect(run.bindings.map((binding) => binding.file)).toEqual(["inputs/anna.png", outside])
      expect(readRun(handle.db, run.id).bindings.map((binding) => binding.file)).toEqual([
        "inputs/anna.png",
        outside,
      ])
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it("refuses a file that cannot be read before anything is queued", async () => {
    const { routes } = accepting()
    const { client, calls } = fakeComfyUi(routes)

    await expect(
      queueOneRun({
        db: handle.db,
        directory: dir,
        client,
        workflowId: workflow.id,
        configurationId: null,
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
      queueOneRun({
        db: handle.db,
        directory: dir,
        client,
        workflowId: workflow.id,
        configurationId: null,
        bindings: [],
        now,
      })
    ).rejects.toThrow(
      "ComfyUI refused the run: Prompt outputs failed validation. Picture 1: Value not in list: image: 'gone.png'. KSamplerSelect (node 24): Required input is missing."
    )
  })

  it("refuses a slot the workflow does not have", async () => {
    const { routes } = accepting()
    const { client } = fakeComfyUi(routes)

    await expect(
      queueOneRun({
        db: handle.db,
        directory: dir,
        client,
        workflowId: workflow.id,
        configurationId: null,
        bindings: [{ slotId: 999, on: true, value: null }],
        now,
      })
    ).rejects.toThrow(expect.objectContaining({ code: "not-found" }))
  })

  describe("a batch", () => {
    function configuration(): number {
      return handle.db
        .insert(schema.configurations)
        .values({
          workflowId: workflow.id,
          name: "Anna",
          bindings: [],
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get().id
    }

    it("queues one run per count, each after the first with fresh seeds, all else the same", async () => {
      const { routes } = accepting()
      const { client } = fakeComfyUi(routes)
      const configurationId = configuration()
      const fresh = [101, 102, 103, 104]
      const seedSlotIds = workflow.slots
        .filter((slot) => slot.kind === "seed")
        .map((slot) => slot.id)
      expect(seedSlotIds.length).toBeGreaterThan(0)

      const runs = await queueBatch({
        db: handle.db,
        directory: dir,
        client,
        workflowId: workflow.id,
        configurationId,
        bindings: [
          { slotId: slotId("Prompt"), on: true, value: { type: "value", value: "She turns." } },
          { slotId: slotId("Seed"), on: true, value: { type: "value", value: 42 } },
        ],
        count: 3,
        randomSeed: () => fresh.shift() as number,
        now,
      })

      expect(runs).toHaveLength(3)
      expect(runs.map((run) => run.configurationId)).toEqual([
        configurationId,
        configurationId,
        configurationId,
      ])
      expect(runs.map((run) => run.configurationName)).toEqual(["Anna", "Anna", "Anna"])
      for (const seedSlotId of seedSlotIds) {
        const seeds = runs.map(
          (run) => run.bindings.find((binding) => binding.slotId === seedSlotId)?.value
        )
        expect(new Set(seeds).size).toBe(3)
      }
      expect(runs.map((run) => run.seed)).toEqual([42, 101, 102])
      for (const run of runs) {
        expect(run.bindings.filter((binding) => !seedSlotIds.includes(binding.slotId))).toEqual([
          {
            slotId: slotId("Prompt"),
            slotName: "Prompt",
            on: true,
            value: "She turns.",
            file: null,
          },
        ])
      }
    })

    it("asks for the classes once and sends a bound file once for the whole batch", async () => {
      const picture = join(dir, "anna.png")
      writeFileSync(picture, Buffer.from([1, 2, 3]))
      const { routes } = accepting()
      const { client, calls } = fakeComfyUi(routes)
      const fresh = [101, 102]

      await queueBatch({
        db: handle.db,
        directory: dir,
        client,
        workflowId: workflow.id,
        configurationId: null,
        bindings: [
          {
            slotId: slotId("Picture 3 (bypassed: Ctrl+B to use)"),
            on: true,
            value: { type: "file", path: picture },
          },
        ],
        count: 3,
        randomSeed: () => fresh.shift() as number,
        now,
      })

      const count = (path: string): number => calls.filter((call) => call.path === path).length
      expect(count("/object_info")).toBe(1)
      expect(count("/upload/image")).toBe(1)
      const images = calls
        .filter((call) => call.path === "/prompt")
        .map((call) => JSON.parse(call.init.body as string).prompt["12"].inputs.image)
      expect(images).toEqual(["preshoot/anna.png", "preshoot/anna.png", "preshoot/anna.png"])
    })

    it("queues one run as given when the count is one", async () => {
      const { routes } = accepting()
      const { client } = fakeComfyUi(routes)

      const runs = await queueBatch({
        db: handle.db,
        directory: dir,
        client,
        workflowId: workflow.id,
        configurationId: null,
        bindings: [],
        count: 1,
        randomSeed: () => {
          throw new Error("a single run keeps its seed")
        },
        now,
      })

      expect(runs.map((run) => [run.seed, run.configurationId])).toEqual([[757358688076805, null]])
    })

    it("refuses a configuration of another workflow before anything is queued", async () => {
      const { routes } = accepting()
      const { client, calls } = fakeComfyUi(routes)

      await expect(
        queueBatch({
          db: handle.db,
          directory: dir,
          client,
          workflowId: workflow.id,
          configurationId: 999,
          bindings: [],
          count: 2,
          randomSeed: () => 1,
          now,
        })
      ).rejects.toThrow(expect.objectContaining({ code: "not-found" }))
      expect(calls).toEqual([])
    })
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

    const status = await polled(client, runId)

    expect(status.run.state).toBe("queued")
    expect(status.position).toBe(2)
  })

  it("reports a run ComfyUI is working on as running", async () => {
    const runId = await queued()
    const { client } = fakeComfyUi({
      "/queue": () => json({ queue_running: [[3, "a1b2", {}, {}, []]], queue_pending: [] }),
    })

    const status = await polled(client, runId)

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

    const status = await polled(client, runId)

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

    const status = await polled(client, runId)

    expect(status.run.state).toBe("failed")
    expect(status.run.error).toMatch(/no record of this run/)
  })

  it("reads the queue once for every unfinished run, and asks for history only off the queue", async () => {
    const first = await queued()
    const second = await queued()
    handle.db.update(schema.runs).set({ promptId: "gone" }).where(eq(schema.runs.id, second)).run()
    const { client, calls } = fakeComfyUi({
      "/queue": () => json({ queue_running: [], queue_pending: [[5, "a1b2", {}, {}, []]] }),
      "/history/gone": () => json({}),
    })

    const statuses = await pollRuns({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      now,
    })

    expect(statuses.map((status) => [status.run.id, status.run.state, status.position])).toEqual([
      [first, "queued", 1],
      [second, "failed", null],
    ])
    expect(calls.map((call) => call.path)).toEqual(["/queue", "/history/gone"])
  })

  it("asks ComfyUI nothing when no run is unfinished", async () => {
    const { client, calls } = fakeComfyUi({})

    const statuses = await pollRuns({
      db: handle.db,
      directory: dir,
      client,
      workflowId: workflow.id,
      now,
    })

    expect(statuses).toEqual([])
    expect(calls).toEqual([])
  })

  describe("cancelling a run", () => {
    /** A ComfyUI whose queue holds `queue`, recording each post and answering it with `answer`. */
    function queueHolding(
      queue: { queue_running: unknown[]; queue_pending: unknown[] },
      answer: () => Response = () => new Response(null, { status: 200 })
    ): ReturnType<typeof fakeComfyUi> {
      const read = (): Response => json(queue)
      return fakeComfyUi({
        "/queue": (_url, init) => (init.method === "POST" ? answer() : read()),
        "/interrupt": () => answer(),
      })
    }

    function cancel(client: ComfyUiClient, runId: number): ReturnType<typeof cancelRun> {
      return cancelRun({ db: handle.db, client, runId, now })
    }

    it("takes a waiting run off the queue and marks it failed", async () => {
      const runId = await queued()
      const { client, calls } = queueHolding({
        queue_running: [[1, "other", {}, {}, []]],
        queue_pending: [[5, "a1b2", {}, {}, []]],
      })

      const run = await cancel(client, runId)

      expect(run).toMatchObject({ state: "failed", error: "Cancelled." })
      expect(readRun(handle.db, runId).state).toBe("failed")
      expect(calls.map((call) => [call.path, call.init.method])).toEqual([
        ["/queue", "GET"],
        ["/queue", "POST"],
      ])
      expect(JSON.parse(calls[1].init.body as string)).toEqual({ delete: ["a1b2"] })
    })

    it("stops a running run and marks it failed", async () => {
      const runId = await queued()
      const { client, calls } = queueHolding({
        queue_running: [[3, "a1b2", {}, {}, []]],
        queue_pending: [[5, "next", {}, {}, []]],
      })

      const run = await cancel(client, runId)

      expect(run).toMatchObject({ state: "failed", error: "Cancelled." })
      expect(calls.map((call) => [call.path, call.init.method])).toEqual([
        ["/queue", "GET"],
        ["/interrupt", "POST"],
      ])
      expect(JSON.parse(calls[1].init.body as string)).toEqual({ prompt_id: "a1b2" })
    })

    it("leaves a run in neither place to the next poll and says there was nothing to cancel", async () => {
      const runId = await queued()
      const { client, calls } = queueHolding({ queue_running: [], queue_pending: [] })

      await expect(cancel(client, runId)).rejects.toThrow(
        expect.objectContaining({ code: "nothing-to-cancel" })
      )

      expect(readRun(handle.db, runId).state).toBe("queued")
      expect(calls.map((call) => call.path)).toEqual(["/queue"])
    })

    it("asks ComfyUI nothing about a run that has finished", async () => {
      const runId = await queued()
      handle.db.update(schema.runs).set({ state: "done" }).where(eq(schema.runs.id, runId)).run()
      const { client, calls } = queueHolding({ queue_running: [], queue_pending: [] })

      await expect(cancel(client, runId)).rejects.toThrow(
        expect.objectContaining({ code: "nothing-to-cancel" })
      )

      expect(calls).toEqual([])
      expect(readRun(handle.db, runId).state).toBe("done")
    })

    it("keeps the run as it was when ComfyUI refuses, and says why", async () => {
      const runId = await queued()
      const { client } = queueHolding(
        { queue_running: [], queue_pending: [[5, "a1b2", {}, {}, []]] },
        () => new Response("Bad Request", { status: 400 })
      )

      await expect(cancel(client, runId)).rejects.toThrow(
        "ComfyUI refused to take the run off the queue: Bad Request"
      )

      expect(readRun(handle.db, runId).state).toBe("queued")
    })
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

      const status = await polled(client, runId)
      const again = await pollRuns({
        db: handle.db,
        directory: dir,
        client,
        workflowId: workflow.id,
        now,
      })

      expect(status.run.state).toBe("done")
      expect(status.run.outputs.map((output) => [output.path, output.sourceFilename])).toEqual([
        [`outputs/run-${runId}/clip_00001_.mp4`, "clip_00001_.mp4"],
        [`outputs/run-${runId}/clip_00001_-2.mp4`, "clip_00001_.mp4"],
      ])
      expect(readFileSync(join(dir, status.run.outputs[0].path), "utf8")).toBe("video/2026-03-04")
      expect(readFileSync(join(dir, status.run.outputs[1].path), "utf8")).toBe("video/other")
      expect(again).toEqual([])
      expect(calls.filter((call) => call.path === "/view")).toHaveLength(2)
    })

    it("leaves out the previews ComfyUI keeps in its temp folder", async () => {
      const runId = await queued()
      const { client, calls } = fakeComfyUi({
        ...finished,
        "/history/a1b2": () =>
          json({
            a1b2: {
              outputs: {
                "32": {
                  images: [
                    { filename: "clip_00001_.mp4", subfolder: "video", type: "output" },
                    { filename: "ComfyUI_temp_abcde_00001_.png", subfolder: "", type: "temp" },
                  ],
                },
              },
              status: { status_str: "success", messages: [] },
            },
          }),
        "/view": (url) => new Response(url.searchParams.get("filename")),
      })

      const status = await polled(client, runId)

      expect(status.run.outputs.map((output) => output.sourceFilename)).toEqual(["clip_00001_.mp4"])
      expect(existsSync(join(dir, `outputs/run-${runId}/ComfyUI_temp_abcde_00001_.png`))).toBe(
        false
      )
      expect(calls.filter((call) => call.path === "/view")).toHaveLength(1)
    })

    it("still records the other runs when one cannot be copied, then says why", async () => {
      const failing = await queued()
      const other = await queued()
      handle.db.update(schema.runs).set({ promptId: "next" }).where(eq(schema.runs.id, other)).run()
      const { client } = fakeComfyUi({
        ...finished,
        "/queue": () => json({ queue_running: [[3, "next", {}, {}, []]], queue_pending: [] }),
        "/view": () => new Response("gone", { status: 404 }),
      })

      await expect(polled(client, failing)).rejects.toThrow(
        expect.objectContaining({ code: "bad-response" })
      )

      expect(readRun(handle.db, failing).state).toBe("queued")
      expect(readRun(handle.db, other).state).toBe("running")
    })

    it("stays unfinished when a file cannot be copied, for the next poll to try again", async () => {
      const runId = await queued()
      const { client } = fakeComfyUi({
        ...finished,
        "/view": () => new Response("gone", { status: 404 }),
      })

      await expect(polled(client, runId)).rejects.toThrow(
        expect.objectContaining({ code: "bad-response" })
      )
      const { client: recovered } = fakeComfyUi({ ...finished, "/view": () => new Response("x") })
      const status = await polled(recovered, runId)

      expect(status.run.state).toBe("done")
      expect(existsSync(join(dir, `outputs/run-${runId}/clip_00001_.mp4.part`))).toBe(false)
    })
  })
})
