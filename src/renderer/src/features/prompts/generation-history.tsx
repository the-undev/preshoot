import type { GenerationRecord } from "@renderer/lib/trpc"
import { PromptResult } from "./prompt-result"

interface GenerationHistoryProps {
  generations: GenerationRecord[]
}

/** Prompts generated in this project before, in the order given. */
export function GenerationHistory({ generations }: GenerationHistoryProps): React.JSX.Element {
  if (generations.length === 0) {
    return <p className="text-sm text-muted-foreground">Earlier prompts appear here.</p>
  }

  return (
    <ul className="flex flex-col gap-4">
      {generations.map((generation) => (
        <li key={generation.id}>
          <PromptResult generation={generation} />
        </li>
      ))}
    </ul>
  )
}
