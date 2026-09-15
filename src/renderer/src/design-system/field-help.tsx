import { CircleQuestionMark } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"

interface FieldHelpProps {
  /** What the field is for, in a sentence or two. */
  children: string
  /** The field this explains, so the button says which one it belongs to. */
  label: string
}

/**
 * What a field is for, behind a question mark beside its label. Fields carry this rather than an
 * example inside them, because an example in an empty field reads as something the clip already
 * holds.
 */
export function FieldHelp({ children, label }: FieldHelpProps): React.JSX.Element {
  // Its own provider, so a field carrying one works wherever it is put and in a test of its own.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={`What ${label} is for`}
          className="text-muted-foreground hover:text-foreground"
        >
          <CircleQuestionMark className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
