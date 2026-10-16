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

  /** The JSON body of a GET, telling an instance that never answered from one that answered badly. */
  private async getJson(path: string, timeoutMs: number): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw BackendError.timeout(timeoutMs / 1000)
      }
      throw BackendError.unreachable(this.baseUrl)
    }
    if (!response.ok) {
      throw BackendError.badResponse()
    }
    try {
      return await response.json()
    } catch {
      throw BackendError.badResponse()
    }
  }
}
