import type { LineComposition, LineInput } from "@renderer/lib/trpc"

/** A stored line as the editor sends it back, which is the same thing without its id or its names. */
export function asLineInput(line: LineComposition): LineInput {
  return {
    kind: line.kind,
    assetId: line.assetId,
    speakerIds: line.speakerIds,
    text: line.text,
    language: line.language,
    offScreen: line.offScreen,
    crossesCut: line.crossesCut,
    cutOff: line.cutOff,
  }
}
