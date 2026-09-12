import { PromptServiceError } from "../prompting/errors"
import type {
  ImageAttachment,
  LlamaServerClient,
  ServerModel,
} from "../prompting/llama-server-client"

/** Long enough for a paragraph about one thing, and no longer. */
const MAX_TOKENS = 400

/** Written to be read by whatever writes the prompt later, not by the person reading the library. */
export const ASSET_DESCRIPTION_PROMPT = `You describe what is in a picture so that a video generation model can put the same thing on screen later.

Write one paragraph. Describe only what can be seen: build, age, hair, skin, clothing and its condition for a person; layout, materials, light and weather for a place; shape, size, material, colour and wear for an object. Say what is distinctive about this one, the things that would make it recognisable again.

When you are given more than one picture, they are the same thing from different angles or moments. Describe the thing, not the pictures, and leave out what changes between them.

Do not write a story, a mood, a camera angle or a shot type. Do not say what the thing is doing. Do not mention the picture, the photograph, the image or the background unless the background is the thing itself. Do not begin with "This is" or "The image shows".`

/** What to describe, and the pictures of it. */
export interface DescribeAssetRequest {
  client: LlamaServerClient
  model: ServerModel
  kind: string
  name: string
  images: ImageAttachment[]
}

/** Asks the local model to write a library thing's description from its pictures. */
export async function describeAsset(request: DescribeAssetRequest): Promise<string> {
  if (request.images.length === 0) {
    throw PromptServiceError.badResponse()
  }
  if (!request.model.modalities.includes("image")) {
    throw new PromptServiceError(
      "bad-response",
      `${request.model.id} cannot see pictures. Choose a model with vision in settings, and start llama-server without --no-mmproj.`
    )
  }

  const answer = await request.client.describe({
    model: request.model.id,
    system: ASSET_DESCRIPTION_PROMPT,
    user: `Describe this ${request.kind}, which this project calls "${request.name}".`,
    images: request.images,
    maxTokens: MAX_TOKENS,
  })

  const described = answer.content.trim()
  if (described.length === 0) {
    throw PromptServiceError.badResponse()
  }
  return described
}
