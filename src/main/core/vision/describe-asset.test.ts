import { describe, expect, it, vi } from "vitest"
import type {
  DescribeRequest,
  LlamaServerClient,
  ServerModel,
} from "../prompting/llama-server-client"
import { describeAsset } from "./describe-asset"

const seeing: ServerModel = { id: "qwen", state: "loaded", modalities: ["text", "image"] }
const blind: ServerModel = { id: "text-only", state: "loaded", modalities: ["text"] }

const images = [
  { mediaType: "image/png", base64: "AAA" },
  { mediaType: "image/jpeg", base64: "BBB" },
]

function clientAnswering(content: string): {
  client: LlamaServerClient
  requests: DescribeRequest[]
} {
  const requests: DescribeRequest[] = []
  const describeCall = vi.fn(async (request: DescribeRequest) => {
    requests.push(request)
    return { content, model: "qwen" }
  })
  return { client: { describe: describeCall } as unknown as LlamaServerClient, requests }
}

describe("describeAsset", () => {
  it("sends every picture, with what the thing is and what it is called", async () => {
    const { client, requests } = clientAnswering("An elderly man in oilskins.")

    await describeAsset({ client, model: seeing, kind: "person", name: "Keeper", images })

    expect(requests[0].images).toEqual(images)
    expect(requests[0].user).toContain("person")
    expect(requests[0].user).toContain("Keeper")
    expect(requests[0].model).toBe("qwen")
  })

  it("returns what the model wrote, without the space around it", async () => {
    const { client } = clientAnswering("  An elderly man in oilskins.  ")

    const described = await describeAsset({
      client,
      model: seeing,
      kind: "person",
      name: "Keeper",
      images,
    })

    expect(described).toBe("An elderly man in oilskins.")
  })

  it("refuses a model that cannot see pictures, naming it", async () => {
    const { client, requests } = clientAnswering("anything")

    await expect(
      describeAsset({ client, model: blind, kind: "person", name: "Keeper", images })
    ).rejects.toThrow(
      expect.objectContaining({
        code: "bad-response",
        message: expect.stringContaining("text-only"),
      })
    )
    expect(requests).toEqual([])
  })

  it("refuses a thing with no pictures", async () => {
    const { client } = clientAnswering("anything")

    await expect(
      describeAsset({ client, model: seeing, kind: "person", name: "Keeper", images: [] })
    ).rejects.toThrow(expect.objectContaining({ code: "bad-response" }))
  })

  it("refuses an answer with nothing in it", async () => {
    const { client } = clientAnswering("   ")

    await expect(
      describeAsset({ client, model: seeing, kind: "person", name: "Keeper", images })
    ).rejects.toThrow(expect.objectContaining({ code: "bad-response" }))
  })
})
