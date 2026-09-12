import type { ComposedPrompt } from "./composers/composer"
import type { LlamaServerClient } from "./llama-server-client"
import type { PromptTarget, TargetFields } from "./target"

/** Enough to rewrite a whole prompt with room to spare. */
const MAX_TOKENS = 900

/** A finished prompt, and the change asked for in words. */
export interface EditRequest {
  target: PromptTarget
  client: LlamaServerClient
  model: string
  systemPrompt: string
  previous: TargetFields
  instruction: string
}

/**
 * Rewrites a prompt with one change made. This is not a composer: a composer turns a clip into a
 * prompt, and widening that interface would make every composer take an input it cannot use.
 */
export async function editPrompt(request: EditRequest): Promise<ComposedPrompt> {
  const { target } = request
  const answer = await request.client.chat({
    model: request.model,
    system: request.systemPrompt,
    user: target.edit.userMessage(target.render(request.previous), request.instruction),
    schema: target.edit.schema,
    maxTokens: MAX_TOKENS,
  })

  const fields = target.edit.readFields(answer.content)
  return { fields, rendered: target.render(fields), model: answer.model, prose: null }
}
