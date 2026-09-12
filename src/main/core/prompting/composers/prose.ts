import { CompositionError } from "../../composition/errors"
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
    target,
    client,
    scope,
  }: ComposeInput): Promise<ComposedPrompt> {
    if (composition.shots.length === 0) {
      throw CompositionError.nothingToWrite("Add a shot before writing this clip.")
    }

    const answer = await client.chat({
      model,
      system: target.prose.systemPrompt,
      user: target.prose.instruction(composition, scope),
      schema: target.prose.schema,
      maxTokens: BASE_TOKENS + TOKENS_PER_SHOT * composition.shots.length,
    })

    const prose = target.prose.readProse(answer.content, composition, scope)
    const fields = target.prose.assemble(composition, prose)
    return { fields, rendered: target.render(fields), model: answer.model, prose }
  },
}
