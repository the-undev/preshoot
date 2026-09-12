import { CompositionError } from "../../composition/errors"
import type { ClipProse } from "../../composition/prose"
import { renderPrompt } from "../target"
import type { ComposeInput, ComposedPrompt, PromptComposer } from "./composer"

/** Room for the two clip-level fields, plus room for each shot's prose. */
const BASE_TOKENS = 500
const TOKENS_PER_SHOT = 350

/**
 * Asks the model for the prose of every shot in one request, so a look, a voice or a gesture can
 * carry across a cut, and lets the target put the markers and cut times around the answer.
 */
export const proseComposer: PromptComposer = {
  id: "prose",
  name: "Model prose per shot",

  async compose({
    composition,
    model,
    systemPrompt,
    target,
    client,
    scope,
  }: ComposeInput): Promise<ComposedPrompt> {
    if (composition.shots.length === 0) {
      throw CompositionError.nothingToWrite("Add a shot before writing this clip.")
    }

    const request = {
      model,
      system: systemPrompt,
      user: target.prose.instruction(composition, scope),
      schema: target.prose.schema,
      maxTokens: BASE_TOKENS + TOKENS_PER_SHOT * composition.shots.length,
    }

    // The model leaves something out often enough that one more go is worth more than a message.
    let answer = await client.chat(request)
    let prose: ClipProse
    try {
      prose = target.prose.readProse(answer.content, composition, scope)
    } catch {
      answer = await client.chat(request)
      prose = target.prose.readProse(answer.content, composition, scope)
    }

    const fields = target.prose.assemble(composition, prose)
    return {
      fields,
      rendered: renderPrompt(target, composition, fields),
      model: answer.model,
      prose,
    }
  },
}
