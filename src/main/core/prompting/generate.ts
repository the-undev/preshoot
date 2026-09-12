import { PromptServiceError } from "./errors"
import type { LlamaServerClient } from "./llama-server-client"
import {
  H3_PROMPT_SCHEMA,
  H3_SYSTEM_PROMPT,
  h3PromptSchema,
  h3UserMessage,
  renderH3Prompt,
  type H3Prompt,
} from "./targets/minimax-h3"

/** Enough for the three fields of one clip with room to spare. */
const MAX_TOKENS = 800

/** A prompt as the model wrote it, ready to show and to store. */
export interface GeneratedPrompt {
  fields: H3Prompt
  rendered: string
  model: string
}

/** Turns a brief into one MiniMax H3 text-to-video prompt. */
export async function generateH3Prompt(
  client: LlamaServerClient,
  brief: string
): Promise<GeneratedPrompt> {
  const answer = await client.chat({
    system: H3_SYSTEM_PROMPT,
    user: h3UserMessage(brief),
    schema: H3_PROMPT_SCHEMA,
    maxTokens: MAX_TOKENS,
  })
  const fields = h3PromptSchema.safeParse(parseJson(answer.content))
  if (!fields.success) {
    throw PromptServiceError.badResponse()
  }
  return { fields: fields.data, rendered: renderH3Prompt(fields.data), model: answer.model }
}

/** The answer as JSON, or `undefined` when the model wrote something else. */
function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}
