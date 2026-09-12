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
  })

  it("returns the answer and the model that wrote it", async () => {
    const client = new LlamaServerClient({ baseUrl, fetch: respondWith(chatBody) })

    expect(await client.chat(chatRequest())).toEqual({
      content: '{"ok":true}',
      model: "Qwen3.5-9B",
    })
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
