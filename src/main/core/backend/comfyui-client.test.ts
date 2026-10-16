import { describe, expect, it, vi } from "vitest"
import { ComfyUiClient } from "./comfyui-client"

const baseUrl = "http://127.0.0.1:8188"

/** A fetch that answers every call with the same response. */
function respondWith(body: unknown, init?: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), init)) as unknown as typeof fetch
}

/** A fetch that fails the way Node's does when nothing is listening. */
const refuse = vi.fn(async () => {
  throw new TypeError("fetch failed")
}) as unknown as typeof fetch

/** What `/system_stats` answers with, trimmed to a few of its fields. */
const systemStats = {
  system: {
    os: "linux",
    ram_total: 100576378880,
    ram_free: 88923918336,
    comfyui_version: "0.39.2",
  },
  devices: [],
}

/** Two node classes in the shape `/object_info` gives them. */
const objectInfo = {
  KSampler: {
    input: { required: { seed: ["INT", { default: 0 }] } },
    output: ["LATENT"],
    display_name: "KSampler",
    category: "sampling",
  },
  SaveImage: {
    input: { required: { images: ["IMAGE"] } },
    output: [],
    output_node: true,
  },
}

describe("ComfyUiClient", () => {
  it("reports a reachable instance with its version", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(systemStats)))
    const client = new ComfyUiClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch })

    expect(await client.status()).toEqual({ state: "reachable", version: "0.39.2" })
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${baseUrl}/system_stats`)
  })

  it("drops a trailing slash from the base URL", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(systemStats)))
    const client = new ComfyUiClient({
      baseUrl: `${baseUrl}/`,
      fetch: fetchMock as unknown as typeof fetch,
    })

    await client.status()

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${baseUrl}/system_stats`)
  })

  it("reports a refused connection as unreachable", async () => {
    const client = new ComfyUiClient({ baseUrl, fetch: refuse })

    expect(await client.status()).toEqual({ state: "unreachable" })
  })

  it("reports a check that timed out as unreachable", async () => {
    const timeOut = vi.fn(async () => {
      const error = new Error("The operation was aborted due to timeout")
      error.name = "TimeoutError"
      throw error
    }) as unknown as typeof fetch
    const client = new ComfyUiClient({ baseUrl, fetch: timeOut })

    expect(await client.status()).toEqual({ state: "unreachable" })
  })

  it("reports a body that is not JSON as unreachable", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>not ComfyUI</html>"))
    const client = new ComfyUiClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch })

    expect(await client.status()).toEqual({ state: "unreachable" })
  })

  it("reports an error status as unreachable", async () => {
    const client = new ComfyUiClient({
      baseUrl,
      fetch: respondWith({ error: "not found" }, { status: 404 }),
    })

    expect(await client.status()).toEqual({ state: "unreachable" })
  })

  it("reports JSON without a version as unreachable", async () => {
    const client = new ComfyUiClient({ baseUrl, fetch: respondWith({ status: "ok" }) })

    expect(await client.status()).toEqual({ state: "unreachable" })
  })

  it("fetches the node classes from object_info", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(objectInfo)))
    const client = new ComfyUiClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch })

    expect(await client.objectInfo()).toEqual(objectInfo)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${baseUrl}/object_info`)
  })

  it("names the URL when object_info cannot be reached", async () => {
    const client = new ComfyUiClient({ baseUrl, fetch: refuse })

    await expect(client.objectInfo()).rejects.toThrow(
      expect.objectContaining({ code: "unreachable", message: expect.stringContaining(baseUrl) })
    )
  })

  it("reads object_info that is not a list of node classes as a bad response", async () => {
    const client = new ComfyUiClient({ baseUrl, fetch: respondWith({ KSampler: "nope" }) })

    await expect(client.objectInfo()).rejects.toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })
})
