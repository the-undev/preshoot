import { z } from "zod"
import { BackendError } from "./errors"

/** Whether an instance answered, and which ComfyUI it runs when it did. */
export type ComfyUiStatus = { state: "unreachable" } | { state: "reachable"; version: string }

/** What the client needs to reach an instance. `fetch` is a parameter so tests can supply their own. */
export interface ComfyUiClientOptions {
  baseUrl: string
  fetch: typeof fetch
}

/** How long a status check waits, which is short because a settings dialog is waiting on it. */
const STATUS_TIMEOUT_MS = 5_000

/** How long the node list may take, which is a few megabytes of JSON. */
const OBJECT_INFO_TIMEOUT_MS = 30_000

const systemStatsSchema = z.object({
  system: z.object({ comfyui_version: z.string() }),
})

/** One node class as `/object_info` describes it. Only what every class carries is checked. */
const nodeClassSchema = z.looseObject({
  input: z.record(z.string(), z.unknown()),
  output: z.array(z.unknown()),
})

const objectInfoSchema = z.record(z.string(), nodeClassSchema)

/** Every node class the instance can run, keyed by class name. */
export type ObjectInfo = z.infer<typeof objectInfoSchema>

/** How long a queue or history check waits, which the renderer repeats every second or two. */
const POLL_TIMEOUT_MS = 10_000

/** How long a post to the queue may take, which validates the whole prompt first. */
const QUEUE_TIMEOUT_MS = 30_000

/** How long taking a prompt off the queue or stopping it may take. */
const CANCEL_TIMEOUT_MS = 10_000

/** How long a file may take to cross either way, which can be a video. */
const TRANSFER_TIMEOUT_MS = 300_000

/** The subfolder of ComfyUI's input folder that files sent from the app go to. */
export const UPLOAD_SUBFOLDER = "preshoot"

/** One node ComfyUI refused, with what it said about it. */
export interface NodeRefusal {
  nodeId: string
  classType: string | null
  messages: string[]
}

/** What ComfyUI said to a prompt: queued under an id, or refused with its reasons. */
export type QueueAnswer =
  | { accepted: true; promptId: string; number: number }
  | { accepted: false; message: string; nodes: NodeRefusal[] }

/** The prompts ComfyUI is running and those waiting, the waiting ones in the order they will run. */
export interface QueueState {
  running: string[]
  pending: string[]
}

/** A file a finished prompt wrote, as `/view` serves it. */
export interface OutputFile {
  nodeId: string
  filename: string
  subfolder: string
  type: string
}

/** How a prompt ended, once it has. */
export type HistoryEntry =
  { state: "success"; outputs: OutputFile[] } | { state: "error"; message: string }

const queuedSchema = z.object({ prompt_id: z.string(), number: z.number() })

const refusalItemSchema = z.looseObject({
  message: z.string().default(""),
  details: z.string().default(""),
})

const refusalSchema = z.looseObject({
  error: z.union([z.string(), refusalItemSchema]).optional(),
  // Some refusals carry an empty list here rather than an object, meaning no node is at fault.
  node_errors: z
    .union([
      z.record(
        z.string(),
        z.looseObject({
          errors: z.array(refusalItemSchema).default([]),
          class_type: z.string().optional(),
        })
      ),
      z.array(z.unknown()).transform(() => ({})),
    ])
    .default({}),
})

/** A queue entry is `[number, prompt_id, prompt, extra_data, outputs_to_execute]`. */
const queueEntrySchema = z.tuple([z.number(), z.string()], z.unknown())

const queueSchema = z.looseObject({
  queue_running: z.array(queueEntrySchema),
  queue_pending: z.array(queueEntrySchema),
})

const historyEntrySchema = z.looseObject({
  outputs: z.record(z.string(), z.unknown()).default({}),
  status: z
    .looseObject({
      status_str: z.string().optional(),
      messages: z.array(z.tuple([z.string(), z.unknown()])).default([]),
    })
    .optional(),
})

const fileEntrySchema = z.looseObject({
  filename: z.string().min(1),
  subfolder: z.string().default(""),
  type: z.string().min(1),
})

const executionErrorSchema = z.looseObject({
  node_id: z.union([z.string(), z.number()]).optional(),
  node_type: z.string().optional(),
  exception_message: z.string().optional(),
})

const uploadSchema = z.looseObject({ name: z.string().min(1), subfolder: z.string().optional() })

/** Talks to one ComfyUI instance over its HTTP API. */
export class ComfyUiClient {
  private readonly baseUrl: string
  private readonly fetch: typeof fetch

  constructor({ baseUrl, fetch }: ComfyUiClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
    this.fetch = fetch
  }

  /** Whether the instance answers and which version it runs. Anything short of that is unreachable. */
  async status(): Promise<ComfyUiStatus> {
    try {
      const body = systemStatsSchema.safeParse(
        await this.getJson("/system_stats", STATUS_TIMEOUT_MS)
      )
      if (!body.success) {
        return { state: "unreachable" }
      }
      return { state: "reachable", version: body.data.system.comfyui_version }
    } catch {
      return { state: "unreachable" }
    }
  }

  /** Every node class the instance can run. Fetched on demand, since it is a few megabytes. */
  async objectInfo(): Promise<ObjectInfo> {
    const body = objectInfoSchema.safeParse(
      await this.getJson("/object_info", OBJECT_INFO_TIMEOUT_MS)
    )
    if (!body.success) {
      throw BackendError.badResponse()
    }
    return body.data
  }

  /** Queues a prompt in API format. A prompt that fails ComfyUI's checks comes back refused. */
  async queuePrompt(prompt: unknown, clientId: string): Promise<QueueAnswer> {
    const response = await this.send(
      "/prompt",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, client_id: clientId }),
      },
      QUEUE_TIMEOUT_MS
    )
    const body = await readJson(response)
    if (response.ok) {
      const queued = queuedSchema.safeParse(body)
      if (!queued.success) throw BackendError.badResponse()
      return { accepted: true, promptId: queued.data.prompt_id, number: queued.data.number }
    }
    const refusal = refusalSchema.safeParse(body)
    if (response.status !== 400 || !refusal.success) throw BackendError.badResponse()
    return { accepted: false, ...readRefusal(refusal.data) }
  }

  /** The prompts running and waiting. */
  async queue(): Promise<QueueState> {
    const body = queueSchema.safeParse(await this.getJson("/queue", POLL_TIMEOUT_MS))
    if (!body.success) throw BackendError.badResponse()
    const byNumber = [...body.data.queue_pending].sort((a, b) => a[0] - b[0])
    return {
      running: body.data.queue_running.map((entry) => entry[1]),
      pending: byNumber.map((entry) => entry[1]),
    }
  }

  /** Takes waiting prompts off the queue. A prompt that is not waiting is passed over. */
  async deletePending(promptIds: string[]): Promise<void> {
    await this.post(
      "/queue",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete: promptIds }),
      },
      "to take the run off the queue"
    )
  }

  /** Stops `promptId` while it runs. An older ComfyUI ignores the id and stops whatever runs. */
  async interrupt(promptId: string): Promise<void> {
    await this.post(
      "/interrupt",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_id: promptId }),
      },
      "to stop the running prompt"
    )
  }

  /** How a prompt ended, or nothing while it has not. */
  async history(promptId: string): Promise<HistoryEntry | null> {
    const body = await this.getJson(`/history/${encodeURIComponent(promptId)}`, POLL_TIMEOUT_MS)
    const history = z.record(z.string(), z.unknown()).safeParse(body)
    if (!history.success) throw BackendError.badResponse()
    if (!(promptId in history.data)) return null
    const entry = historyEntrySchema.safeParse(history.data[promptId])
    if (!entry.success) throw BackendError.badResponse()
    if (entry.data.status?.status_str === "error") {
      return { state: "error", message: failureOf(entry.data.status.messages) }
    }
    return { state: "success", outputs: outputFiles(entry.data.outputs) }
  }

  /** The bytes of a file a prompt wrote. */
  async view(file: OutputFile): Promise<Uint8Array> {
    const query = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder,
      type: file.type,
    })
    const response = await this.send(`/view?${query}`, { method: "GET" }, TRANSFER_TIMEOUT_MS)
    if (!response.ok) throw BackendError.badResponse()
    return new Uint8Array(await response.arrayBuffer())
  }

  /**
   * Sends a file into ComfyUI's input folder and returns the value a loader takes for it, which
   * names the subfolder. ComfyUI may rename the file, so the name it answers with is the one used.
   */
  async upload(fileName: string, bytes: Uint8Array): Promise<string> {
    const form = new FormData()
    // Copied, since a Blob takes only bytes over a plain ArrayBuffer and a Buffer may share one.
    form.append("image", new Blob([Uint8Array.from(bytes)]), fileName)
    form.append("subfolder", UPLOAD_SUBFOLDER)
    form.append("type", "input")
    const response = await this.send(
      "/upload/image",
      { method: "POST", body: form },
      TRANSFER_TIMEOUT_MS
    )
    if (!response.ok) {
      const reason = (await response.text().catch(() => "")).trim()
      throw BackendError.refused(fileName, reason || `it answered ${response.status}.`)
    }
    const body = uploadSchema.safeParse(await readJson(response))
    if (!body.success) throw BackendError.badResponse()
    const subfolder = body.data.subfolder ?? ""
    return subfolder.length > 0 ? `${subfolder}/${body.data.name}` : body.data.name
  }

  /** A post whose answer carries nothing, refused in ComfyUI's words when it says no. */
  private async post(path: string, init: RequestInit, what: string): Promise<void> {
    const response = await this.send(path, init, CANCEL_TIMEOUT_MS)
    if (response.ok) return
    const reason = (await response.text().catch(() => "")).trim()
    throw BackendError.refused(what, reason || `it answered ${response.status}.`)
  }

  /** The JSON body of a GET, telling an instance that never answered from one that answered badly. */
  private async getJson(path: string, timeoutMs: number): Promise<unknown> {
    const response = await this.send(path, { method: "GET" }, timeoutMs)
    if (!response.ok) {
      throw BackendError.badResponse()
    }
    return readJson(response)
  }

  /** One request, with a failure to connect or a timeout told apart from any answer. */
  private async send(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    try {
      return await this.fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw BackendError.timeout(timeoutMs / 1000)
      }
      throw BackendError.unreachable(this.baseUrl)
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw BackendError.badResponse()
  }
}

/** A refusal's own message and each node's, with the details ComfyUI adds after a colon. */
function readRefusal(
  body: z.infer<typeof refusalSchema>
): Omit<Extract<QueueAnswer, { accepted: false }>, "accepted"> {
  const describe = (item: z.infer<typeof refusalItemSchema>): string =>
    item.details.length > 0 ? `${item.message}: ${item.details}` : item.message
  const message =
    typeof body.error === "string" ? body.error : body.error ? describe(body.error) : ""
  const nodes = Object.entries(body.node_errors).map(([nodeId, node]) => ({
    nodeId,
    classType: node.class_type ?? null,
    messages: node.errors.map(describe),
  }))
  return { message, nodes }
}

/** Why a prompt failed, from the execution error ComfyUI recorded. */
function failureOf(messages: [string, unknown][]): string {
  for (const [event, data] of messages) {
    if (event === "execution_interrupted") return "The run was interrupted."
    if (event !== "execution_error") continue
    const error = executionErrorSchema.safeParse(data)
    if (!error.success) break
    const where = error.data.node_type
      ? `${error.data.node_type} (node ${error.data.node_id ?? "?"}): `
      : ""
    return `${where}${error.data.exception_message?.trim() || "it gave no reason."}`
  }
  return "ComfyUI says the run failed and gives no reason."
}

/** Every file in a prompt's outputs, whatever kind of output holds it. */
function outputFiles(outputs: Record<string, unknown>): OutputFile[] {
  const files: OutputFile[] = []
  for (const [nodeId, output] of Object.entries(outputs)) {
    if (typeof output !== "object" || output === null) continue
    for (const entries of Object.values(output)) {
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        const file = fileEntrySchema.safeParse(entry)
        if (file.success) files.push({ nodeId, ...file.data })
      }
    }
  }
  return files
}
