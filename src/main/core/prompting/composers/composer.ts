import type { ClipComposition } from "../../composition/clip"
import type { ClipProse } from "../../composition/prose"
import type { LlamaServerClient } from "../llama-server-client"
import type { ComposeScope, PromptTarget, TargetFields } from "../target"

/** Everything a composer needs: what to write, for which target, through which server, and how much. */
export interface ComposeInput {
  composition: ClipComposition
  target: PromptTarget
  client: LlamaServerClient
  scope: ComposeScope
}

/** What a composer produced, with the prose kept so one shot can be rewritten later. */
export interface ComposedPrompt {
  fields: TargetFields
  rendered: string
  model: string | null
  prose: ClipProse | null
}

/** One way of turning a clip into a prompt. */
export interface PromptComposer {
  id: string
  name: string
  compose(input: ComposeInput): Promise<ComposedPrompt>
}
