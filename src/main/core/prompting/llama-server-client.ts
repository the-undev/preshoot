import { z } from "zod"
import { PromptServiceError } from "./errors"

/** One schema-constrained chat request. The router refuses a request that names no model. */
export interface ChatRequest {
  model: string
  system: string
  user: string
  schema: Record<string, unknown>
  maxTokens: number
}

/** One picture to look at, as the bytes and what they are. */
export interface ImageAttachment {
  mediaType: string
  base64: string
}

/** Asking the model to look at pictures and write prose. There is no schema: an answer is words. */
export interface DescribeRequest {
  model: string
  system: string
  user: string
  images: ImageAttachment[]
  maxTokens: number
}

/** The answer text and the model that wrote it. */
export interface ChatResult {
  content: string
  model: string
}

/** One model the server knows about, and whether it is holding memory right now. */
export interface ServerModel {
  id: string
  state: "loaded" | "unloaded" | "unknown"
  modalities: string[]
}

/** What the client needs to reach a server. `fetch` is a parameter so tests can supply their own. */
export interface LlamaServerClientOptions {
  baseUrl: string
  fetch: typeof fetch
}

/** How long a generation may run before the request is abandoned. */
const CHAT_TIMEOUT_MS = 120_000

const healthResponseSchema = z.object({ status: z.string() })

const modelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      // A server that is not in router mode answers without these two.
      status: z.object({ value: z.string() }).optional(),
      architecture: z.object({ input_modalities: z.array(z.string()) }).optional(),
    })
  ),
})

const chatResponseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
})

/** What the server says about a model, or `unknown` when it does not say. */
function readState(value: string | undefined): ServerModel["state"] {
  if (value === "loaded" || value === "unloaded") {
    return value
  }
  return "unknown"
}

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

  /** Every model the server can serve, with the ones holding memory marked. */
  async models(): Promise<ServerModel[]> {
    const response = await this.send("/v1/models", { method: "GET" })
    if (!response.ok) {
      throw PromptServiceError.badResponse()
    }
    const body = modelsResponseSchema.safeParse(await this.readJson(response))
    if (!body.success) {
      throw PromptServiceError.badResponse()
    }
    return body.data.data.map((model) => ({
      id: model.id,
      state: readState(model.status?.value),
      modalities: model.architecture?.input_modalities ?? [],
    }))
  }

  /** Frees a model, which is how the card is handed to something else without stopping the server. */
  async unload(modelId: string): Promise<void> {
    const response = await this.send("/models/unload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: modelId }),
    })
    if (!response.ok) {
      throw PromptServiceError.badResponse()
    }
  }

  /** Asks for one answer shaped by `request.schema`. */
  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await this.send("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: request.model,
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

  /**
   * Asks for prose about pictures. Separate from `chat` because a vision answer is not JSON, and
   * because the shape of the request that already writes prompts must not change underneath it.
   */
  async describe(request: DescribeRequest): Promise<ChatResult> {
    const response = await this.send("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.system },
          {
            role: "user",
            content: [
              { type: "text", text: request.user },
              ...request.images.map((image) => ({
                type: "image_url",
                image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
              })),
            ],
          },
        ],
        chat_template_kwargs: { enable_thinking: false },
        max_tokens: request.maxTokens,
        temperature: 0.3,
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

  /** Runs a request, telling a server that never answered from one that was never there. */
  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetch(`${this.baseUrl}${path}`, init)
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw PromptServiceError.timeout(CHAT_TIMEOUT_MS / 1000)
      }
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
