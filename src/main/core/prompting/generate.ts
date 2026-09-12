import type { LlamaServerClient } from "./llama-server-client"
import type { TargetFields } from "./target"
import { minimaxH3 } from "./targets/minimax-h3"

/** Enough for the three fields of one clip with room to spare. */
const MAX_TOKENS = 800

/** A prompt as the model wrote it, ready to show and to store. */
export interface GeneratedPrompt {
  fields: TargetFields
  rendered: string
  model: string
}

/** Turns a brief into one MiniMax H3 text-to-video prompt. */
export async function generateH3Prompt(
  client: LlamaServerClient,
  brief: string
): Promise<GeneratedPrompt> {
  const answer = await client.chat({
    system: minimaxH3.brief.systemPrompt,
    user: minimaxH3.brief.userMessage(brief),
    schema: minimaxH3.brief.schema,
    maxTokens: MAX_TOKENS,
  })
  const fields = minimaxH3.brief.readFields(answer.content)
  return { fields, rendered: minimaxH3.render(fields), model: answer.model }
}
