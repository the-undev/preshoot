import { describe, expect, it, vi } from "vitest"
import { ComfyUiClient } from "./comfyui-client"

const baseUrl = "http://127.0.0.1:8188"

type FetchMock = ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>

/** A client whose every request gets `response`, with the mock to read the requests back from. */
function clientAnswering(response: () => Response): {
  client: ComfyUiClient
  fetchMock: FetchMock
} {
  const fetchMock: FetchMock = vi.fn(async () => response())
  return {
    client: new ComfyUiClient({ baseUrl, fetch: fetchMock as unknown as typeof fetch }),
    fetchMock,
  }
}

function json(body: unknown, status = 200): () => Response {
  return () => new Response(JSON.stringify(body), { status })
}

describe("ComfyUiClient.queuePrompt", () => {
  it("posts the prompt with the client id and returns the prompt id", async () => {
    const { client, fetchMock } = clientAnswering(
      json({ prompt_id: "a1b2", number: 7, node_errors: {} })
    )
    const prompt = { "1": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } } }

    expect(await client.queuePrompt(prompt, "client-1")).toEqual({
      accepted: true,
      promptId: "a1b2",
      number: 7,
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/prompt`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ prompt, client_id: "client-1" })
  })

  it("reads a validation refusal with the reasons for each node", async () => {
    const { client } = clientAnswering(
      json(
        {
          error: {
            type: "prompt_outputs_failed_validation",
            message: "Prompt outputs failed validation",
            details: "",
            extra_info: {},
          },
          node_errors: {
            "10": {
              errors: [
                {
                  type: "value_not_in_list",
                  message: "Value not in list",
                  details: "image: 'gone.png' not in ['a.png']",
                  extra_info: {},
                },
              ],
              dependent_outputs: ["32"],
              class_type: "LoadImage",
            },
          },
        },
        400
      )
    )

    expect(await client.queuePrompt({}, "client-1")).toEqual({
      accepted: false,
      message: "Prompt outputs failed validation",
      nodes: [
        {
          nodeId: "10",
          classType: "LoadImage",
          messages: ["Value not in list: image: 'gone.png' not in ['a.png']"],
        },
      ],
    })
  })

  it("reads a refusal of the prompt as a whole, with an empty list for its nodes", async () => {
    const { client } = clientAnswering(
      json(
        {
          error: { type: "invalid_prompt", message: "Cannot execute", details: "Node ID '#5'" },
          node_errors: [],
        },
        400
      )
    )

    expect(await client.queuePrompt({}, "client-1")).toEqual({
      accepted: false,
      message: "Cannot execute: Node ID '#5'",
      nodes: [],
    })
  })

  it("reads a refusal with no node errors", async () => {
    const { client } = clientAnswering(
      json({ error: { type: "prompt_no_outputs", message: "Prompt has no outputs" } }, 400)
    )

    expect(await client.queuePrompt({}, "client-1")).toEqual({
      accepted: false,
      message: "Prompt has no outputs",
      nodes: [],
    })
  })

  it("treats a server error as a bad response", async () => {
    const { client } = clientAnswering(() => new Response("boom", { status: 500 }))

    await expect(client.queuePrompt({}, "client-1")).rejects.toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })
})

describe("ComfyUiClient.queue", () => {
  it("lists running prompts and waiting ones in the order they will run", async () => {
    const { client, fetchMock } = clientAnswering(
      json({
        queue_running: [[4, "running-id", {}, {}, ["9"]]],
        queue_pending: [
          [9, "later-id", {}, {}, ["9"]],
          [6, "next-id", {}, {}, ["9"]],
        ],
      })
    )

    expect(await client.queue()).toEqual({
      running: ["running-id"],
      pending: ["next-id", "later-id"],
    })
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/queue`)
  })
})

describe("ComfyUiClient.deletePending", () => {
  it("posts the prompt ids to delete to the queue", async () => {
    const { client, fetchMock } = clientAnswering(() => new Response(null, { status: 200 }))

    await client.deletePending(["a1b2", "c3d4"])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/queue`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ delete: ["a1b2", "c3d4"] })
  })

  it("surfaces the server's answer when it refuses", async () => {
    const { client } = clientAnswering(() => new Response("Bad Request", { status: 400 }))

    await expect(client.deletePending(["a1b2"])).rejects.toThrow(
      expect.objectContaining({
        code: "refused",
        message: "ComfyUI refused to take the run off the queue: Bad Request",
      })
    )
  })
})

describe("ComfyUiClient.interrupt", () => {
  it("posts to interrupt with no body", async () => {
    const { client, fetchMock } = clientAnswering(() => new Response(null, { status: 200 }))

    await client.interrupt()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/interrupt`)
    expect(init.method).toBe("POST")
    expect(init.body).toBeUndefined()
  })

  it("names the status when a refusal gives no reason", async () => {
    const { client } = clientAnswering(() => new Response("", { status: 500 }))

    await expect(client.interrupt()).rejects.toThrow(
      expect.objectContaining({
        code: "refused",
        message: "ComfyUI refused to stop the running prompt: it answered 500.",
      })
    )
  })
})

describe("ComfyUiClient.history", () => {
  it("answers nothing while the prompt has not finished", async () => {
    const { client, fetchMock } = clientAnswering(json({}))

    expect(await client.history("a1b2")).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/history/a1b2`)
  })

  it("collects every file of every output kind once finished", async () => {
    const { client } = clientAnswering(
      json({
        a1b2: {
          prompt: [],
          outputs: {
            "32": {
              images: [
                { filename: "clip_00001_.mp4", subfolder: "video/2026-03-04", type: "output" },
              ],
              animated: [true],
            },
            "40": { audio: [{ filename: "sound.flac", type: "output" }] },
            "41": { text: ["not a file"] },
          },
          status: { status_str: "success", completed: true, messages: [] },
        },
      })
    )

    expect(await client.history("a1b2")).toEqual({
      state: "success",
      outputs: [
        {
          nodeId: "32",
          filename: "clip_00001_.mp4",
          subfolder: "video/2026-03-04",
          type: "output",
        },
        { nodeId: "40", filename: "sound.flac", subfolder: "", type: "output" },
      ],
    })
  })

  it("gives the server's reason when the prompt failed", async () => {
    const { client } = clientAnswering(
      json({
        a1b2: {
          outputs: {},
          status: {
            status_str: "error",
            completed: false,
            messages: [
              ["execution_start", { prompt_id: "a1b2" }],
              [
                "execution_error",
                {
                  prompt_id: "a1b2",
                  node_id: "28",
                  node_type: "SamplerCustomAdvanced",
                  exception_message: "Allocation on device \n",
                },
              ],
            ],
          },
        },
      })
    )

    expect(await client.history("a1b2")).toEqual({
      state: "error",
      message: "SamplerCustomAdvanced (node 28): Allocation on device",
    })
  })
})

describe("ComfyUiClient.view", () => {
  it("fetches a file's bytes by name, subfolder and type", async () => {
    const { client, fetchMock } = clientAnswering(() => new Response(new Uint8Array([1, 2, 3])))

    const bytes = await client.view({
      nodeId: "32",
      filename: "clip 1.mp4",
      subfolder: "video/2026-03-04",
      type: "output",
    })

    expect([...bytes]).toEqual([1, 2, 3])
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.pathname).toBe("/view")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      filename: "clip 1.mp4",
      subfolder: "video/2026-03-04",
      type: "output",
    })
  })
})

describe("ComfyUiClient.upload", () => {
  it("posts the file as multipart form data and returns the name in its subfolder", async () => {
    const { client, fetchMock } = clientAnswering(
      json({ name: "anna (1).png", subfolder: "preshoot", type: "input" })
    )

    expect(await client.upload("anna.png", new Uint8Array([9, 8]))).toBe("preshoot/anna (1).png")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/upload/image`)
    expect(init.method).toBe("POST")
    const form = init.body as FormData
    const file = form.get("image") as File
    expect(file.name).toBe("anna.png")
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([9, 8])
    expect(form.get("subfolder")).toBe("preshoot")
    expect(form.get("type")).toBe("input")
  })

  it("returns the bare name when the answer has no subfolder", async () => {
    const { client } = clientAnswering(json({ name: "anna.png" }))

    expect(await client.upload("anna.png", new Uint8Array([9]))).toBe("anna.png")
  })

  it("surfaces the server's answer when it refuses the file", async () => {
    const { client } = clientAnswering(() => new Response("400: Bad Request", { status: 400 }))

    await expect(client.upload("voice.wav", new Uint8Array([1]))).rejects.toThrow(
      expect.objectContaining({
        code: "refused",
        message: "ComfyUI refused voice.wav: 400: Bad Request",
      })
    )
  })

  it("treats an answer without a name as a bad response", async () => {
    const { client } = clientAnswering(json({ subfolder: "preshoot" }))

    await expect(client.upload("anna.png", new Uint8Array([9]))).rejects.toThrow(
      expect.objectContaining({ code: "bad-response" })
    )
  })
})
