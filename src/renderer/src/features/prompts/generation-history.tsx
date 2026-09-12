import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/design-system"
import type { GenerationRecord } from "@renderer/lib/trpc"
import { PromptResult, type PromptActionProps } from "./prompt-result"

interface GenerationHistoryProps extends PromptActionProps {
  generations: GenerationRecord[]
}

/** Prompts generated before, with an edit sitting under the prompt it came from. */
export function GenerationHistory({
  generations,
  ...actions
}: GenerationHistoryProps): React.JSX.Element {
  if (generations.length === 0) {
    return <p className="text-sm text-muted-foreground">Earlier prompts appear here.</p>
  }

  // A prompt whose parent is not in this list stands on its own, so nothing is hidden.
  const present = new Set(generations.map((generation) => generation.id))
  const roots = generations.filter(
    (generation) => generation.parentId === null || !present.has(generation.parentId)
  )

  return <Branch generations={generations} parents={roots} {...actions} />
}

interface BranchProps extends PromptActionProps {
  generations: GenerationRecord[]
  parents: GenerationRecord[]
}

/** One level of the chain, with whatever was edited out of each entry under it. */
function Branch({ generations, parents, ...actions }: BranchProps): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-4">
      {parents.map((generation) => {
        const edits = generations.filter((entry) => entry.parentId === generation.id)
        return (
          <li key={generation.id} className="flex flex-col gap-2">
            <Entry generation={generation} {...actions} />
            {edits.length > 0 && (
              <div className="border-l pl-4">
                <Branch generations={generations} parents={edits} {...actions} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

interface EntryProps extends PromptActionProps {
  generation: GenerationRecord
}

/** One prompt as a line, opening to the whole thing. */
function Entry({ generation, ...actions }: EntryProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-1 text-left">
          {open ? (
            <ChevronDown className="size-4 shrink-0" />
          ) : (
            <ChevronRight className="size-4 shrink-0" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">
              {generation.editInstruction ?? generation.brief}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {new Date(generation.createdAt).toLocaleString()} · {generation.composer}
              {generation.verdict ? ` · ${generation.verdict}` : ""}
            </span>
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <PromptResult generation={generation} {...actions} />
      </CollapsibleContent>
    </Collapsible>
  )
}
