import { z } from "zod"
import { PromptServiceError } from "./errors"

/** One schema-constrained chat request. */
export interface ChatRequest {
  system: string
  user: string
  schema: Record<string, unknown>
  maxTokens: number
}

/** The answer text and the model that wrote it. */
export interface ChatResult {
  content: string
  model: string
}

/** What the client needs to reach a server. `fetch` is a parameter so tests can supply their own. */
export interface LlamaServerClientOptions {
  baseUrl: string
  fetch: typeof fetch
}

/** How long a generation may run before the request is abandoned. */
const CHAT_TIMEOUT_MS = 120_000

const healthResponseSchema = z.object({ status: z.string() })

const chatResponseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
})

/** Talks to one llama-server over its OpenAI-compatible API. */
export class LlamaServerClient {
  private readonly baseUrl: string
  private readonly fetch: typeof fetch

  constructor({ baseUrl, fetch }: LlamaServerClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
    this.fetch = fetch
  }

  /** Whether the server has its model ready, or is still loading it. */
  async health(): Promise<"ok" | "loading"> {
    const response = await this.send("/health", { method: "GET" })
    if (response.status === 503) {
      return "loading"
    }
    if (!response.ok) {
      throw PromptServiceError.badResponse()
    }
    const body = healthResponseSchema.safeParse(await this.readJson(response))
    if (!body.success || body.data.status !== "ok") {
      throw PromptServiceError.badResponse()
    }
    return "ok"
  }

  /** Asks for one answer shaped by `request.schema`. */
  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await this.send("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "prompt", schema: request.schema },
        },
        // Qwen3.5 otherwise reasons before it answers, which the schema grammar has no room for.
        chat_template_kwargs: { enable_thinking: false },
        max_tokens: request.maxTokens,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    })
    if (response.status === 503) {
      throw PromptServiceError.loading()
    }
    if (!response.ok) {
      throw PromptServiceError.badResponse()
    }
    const body = chatResponseSchema.safeParse(await this.readJson(response))
    const choice = body.success ? body.data.choices[0] : undefined
    if (!body.success || !choice) {
      throw PromptServiceError.badResponse()
    }
    return { content: choice.message.content, model: body.data.model }
  }

  /** Runs a request against the server, reading a failure to reach it as `unreachable`. */
  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetch(`${this.baseUrl}${path}`, init)
    } catch {
      throw PromptServiceError.unreachable(this.baseUrl)
    }
  }

  /** The body as JSON, or `undefined` when it is not JSON at all. */
  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      return undefined
    }
  }
}
