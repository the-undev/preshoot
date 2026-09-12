import { CompositionError } from "../../composition/errors"
import type { ClipProse } from "../../composition/prose"
import type { ComposeInput, ComposedPrompt, PromptComposer } from "./composer"

/**
 * Builds the prompt from the clip alone, with no model in the way. It is the baseline the other
 * ways are judged against: everything mechanical is right and nothing is written well.
 */
export const assembledComposer: PromptComposer = {
  id: "assembled",
  name: "Assembled without the model",

  async compose({ composition, target }: ComposeInput): Promise<ComposedPrompt> {
    if (composition.shots.length === 0) {
      throw CompositionError.nothingToWrite("Add a shot before writing this clip.")
    }

    const sounds = composition.shots
      .map((shot) => shot.soundNote.trim())
      .filter((note) => note.length > 0)

    const prose: ClipProse = {
      shots: composition.shots.map((shot) => ({
        shotId: shot.id,
        prose: target.prose.describeShot(composition, shot.id),
      })),
      soundscape: sounds.length > 0 ? sounds.join(" ") : "N/A",
      music: composition.musicNote.trim().length > 0 ? composition.musicNote.trim() : "N/A",
    }

    const fields = target.prose.assemble(composition, prose)
    return { fields, rendered: target.render(fields), model: null, prose }
  },
}
