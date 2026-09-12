import { CompositionError } from "../../composition/errors"
import { renderPrompt } from "../target"
import type { ComposeInput, ComposedPrompt, PromptComposer } from "./composer"

/** Enough for the three fields of one clip with room to spare. */
const MAX_TOKENS = 800

/** Writes the whole prompt from what the clip says it is, ignoring its shots. */
export const briefComposer: PromptComposer = {
  id: "brief",
  name: "From this alone, ignoring the shots",

  async compose({
    composition,
    model,
    systemPrompt,
    target,
    client,
  }: ComposeInput): Promise<ComposedPrompt> {
    const note = composition.note.trim()
    if (note.length === 0) {
      throw CompositionError.nothingToWrite(
        "Say what this clip is before writing a prompt from that alone."
      )
    }

    const answer = await client.chat({
      model,
      system: systemPrompt,
      user: target.brief.userMessage(note),
      schema: target.brief.schema,
      maxTokens: MAX_TOKENS,
    })

    const fields = target.brief.readFields(answer.content)
    return {
      fields,
      rendered: renderPrompt(target, composition, fields),
      model: answer.model,
      prose: null,
    }
  },
}
