import { CompositionError } from "../../composition/errors"
import type { ComposeInput, ComposedPrompt, PromptComposer } from "./composer"

/** Enough for the three fields of one clip with room to spare. */
const MAX_TOKENS = 800

/** Writes the whole prompt from the clip's note and ignores its shots, as milestone 2 did. */
export const briefComposer: PromptComposer = {
  id: "brief",
  name: "Brief only, ignoring the shots",

  async compose({ composition, target, client }: ComposeInput): Promise<ComposedPrompt> {
    const note = composition.note.trim()
    if (note.length === 0) {
      throw CompositionError.nothingToWrite("Write a note for this clip before generating from it.")
    }

    const answer = await client.chat({
      system: target.brief.systemPrompt,
      user: target.brief.userMessage(note),
      schema: target.brief.schema,
      maxTokens: MAX_TOKENS,
    })

    const fields = target.brief.readFields(answer.content)
    return { fields, rendered: target.render(fields), model: answer.model, prose: null }
  },
}
