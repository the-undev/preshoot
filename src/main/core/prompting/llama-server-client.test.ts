import { describe, expect, it, vi } from "vitest"
import { PromptServiceError } from "./errors"
import { LlamaServerClient } from "./llama-server-client"

const baseUrl = "http://127.0.0.1:8080"

/** A fetch that answers every call with the same response. */
function respondWith(body: unknown, init?: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), init)) as unknown as typeof fetch
}

function chatRequest(): Parameters<LlamaServerClient["chat"]>[0] {
  return {
    model: "Qwen3.5-9B",
    system: "You write prompts.",
    user: "A baker opens the shutters.",
    schema: { type: "object" },
    maxTokens: 800,
  }
}

const chatBody = {
  model: "Qwen3.5-9B",
  choices: [{ message: { content: '{"ok":true}' } }],
}

describe("LlamaServerClient", () => {
  it("reports a ready server", async () => {
    const client = new LlamaServerClient({ baseUrl, fetch: respondWith({ status: "ok" }) })

    expect(await client.health()).toBe("ok")
  })

  it("reports a server that is still loading its model", async () => {
    const client = new LlamaServerClient({
      baseUrl,
      fetch: respondWith({ status: "loading model" }, { status: 503 }),
    })

    expect(await client.health()).toBe("loading")
  })

  it("names the URL when the server cannot be reached", async () => {
    const refuse = vi.fn(async () => {
      throw new TypeError("fetch failed")
    }) as unknown as typeof fetch
    const client = new LlamaServerClient({ baseUrl, fetch: refuse })

    await expect(client.health()).rejects.toThrow(
      expect.objectContaining({ code: "unreachable", message: expect.stringContaining(baseUrl) })
    )
  })

  it("sends the schema and turns Qwen's thinking off", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(chatBody)))
    const client = new LlamaServerClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch })

    await client.chat(chatRequest())

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${baseUrl}/v1/chat/completions`)
    const sent = JSON.parse(init.body as string)
    expect(sent.response_format.json_schema.schema).toEqual({ type: "object" })
    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(sent.max_tokens).toBe(800)
    expect(sent.messages).toEqual([
      { role: "system", content: "You write prompts." },
      { role: "user", content: "A baker opens the shutters." },
    ])
    expect(sent.model).toBe("Qwen3.5-9B")
  })

  it("lists the models the server has, with the loaded ones marked", async () => {
    const client = new LlamaServerClient({
      baseUrl,
      fetch: respondWith({
        data: [
          {
            id: "unsloth/Qwen3.5-9B-GGUF:Q4_K_M",
            status: { value: "loaded" },
            architecture: { input_modalities: ["text", "image"] },
          },
          {
            id: "other",
            status: { value: "unloaded" },
            architecture: { input_modalities: ["text"] },
          },
        ],
      }),
    })

    expect(await client.models()).toEqual([
      {
        id: "unsloth/Qwen3.5-9B-GGUF:Q4_K_M",
        state: "loaded",
        modalities: ["text", "image"],
      },
      { id: "other", state: "unloaded", modalities: ["text"] },
    ])
  })

  it("reads a server that reports no state as unknown", async () => {
    const client = new LlamaServerClient({
      baseUrl,
      fetch: respondWith({ data: [{ id: "only-one" }] }),
    })

    expect(await client.models()).toEqual([{ id: "only-one", state: "unknown", modalities: [] }])
  })

  it("asks the server to free a model", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"))
    const client = new LlamaServerClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch })

    await client.unload("unsloth/Qwen3.5-9B-GGUF:Q4_K_M")

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${baseUrl}/models/unload`)
    expect(JSON.parse(init.body as string)).toEqual({
      model: "unsloth/Qwen3.5-9B-GGUF:Q4_K_M",
    })
  })

  it("reads a server that does not know how to unload as a bad response", async () => {
    const client = new LlamaServerClient({
      baseUrl,
      fetch: respondWith({ error: "not found" }, { status: 404 }),
    })

    await expect(client.unload("anything")).rejects.toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })

  it("returns the answer and the model that wrote it", async () => {
    const client = new LlamaServerClient({ baseUrl, fetch: respondWith(chatBody) })

    expect(await client.chat(chatRequest())).toEqual({
      content: '{"ok":true}',
      model: "Qwen3.5-9B",
    })
  })

  it("reads a request that was abandoned as a timeout rather than an absent server", async () => {
    const timeOut = vi.fn(async () => {
      const error = new Error("The operation was aborted due to timeout")
      error.name = "TimeoutError"
      throw error
    }) as unknown as typeof fetch
    const client = new LlamaServerClient({ baseUrl, fetch: timeOut })

    await expect(client.chat(chatRequest())).rejects.toThrow(
      expect.objectContaining({ code: "timeout", message: expect.stringContaining("120 seconds") })
    )
  })

  it("reads a refused connection as the server being unreachable", async () => {
    const refuse = vi.fn(async () => {
      throw new TypeError("fetch failed")
    }) as unknown as typeof fetch
    const client = new LlamaServerClient({ baseUrl, fetch: refuse })

    await expect(client.chat(chatRequest())).rejects.toThrow(
      expect.objectContaining({ code: "unreachable" })
    )
  })

  it("reads a server that is loading as loading", async () => {
    const client = new LlamaServerClient({
      baseUrl,
      fetch: respondWith({ status: "loading model" }, { status: 503 }),
    })

    await expect(client.chat(chatRequest())).rejects.toThrow(
      expect.objectContaining({ code: "loading" })
    )
  })

  it("reads a body without a choice as a bad response", async () => {
    const client = new LlamaServerClient({
      baseUrl,
      fetch: respondWith({ model: "x", choices: [] }),
    })

    await expect(client.chat(chatRequest())).rejects.toThrow(PromptServiceError)
    await expect(client.chat(chatRequest())).rejects.toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })

  it("reads a body that is not JSON as a bad response", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>nope</html>"))
    const client = new LlamaServerClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch })

    await expect(client.chat(chatRequest())).rejects.toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })
})
