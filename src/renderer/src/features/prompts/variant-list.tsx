import { Button } from "@renderer/design-system"
import type { PromptVariant } from "@renderer/lib/trpc"

interface VariantListProps {
  variants: PromptVariant[]
  selectedId: string | null
  onSelect: (variant: PromptVariant) => void
  onCopy: (variant: PromptVariant) => void
  onRemove: (id: string) => void
}

/** Every system prompt for one target: the ones it ships with, then the ones written here. */
export function VariantList({
  variants,
  selectedId,
  onSelect,
  onCopy,
  onRemove,
}: VariantListProps): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-1">
      {variants.map((variant) => (
        <li key={variant.id} className="flex items-center gap-2">
          <Button
            variant={variant.id === selectedId ? "secondary" : "ghost"}
            className="h-auto flex-1 justify-start px-3 py-2 text-left"
            onClick={() => onSelect(variant)}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{variant.name}</span>
              <span className="text-xs text-muted-foreground">
                {variant.strategy}
                {variant.editable ? "" : " · built in"}
              </span>
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Copy ${variant.name}`}
            onClick={() => onCopy(variant)}
          >
            Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!variant.editable}
            aria-label={`Delete ${variant.name}`}
            onClick={() => onRemove(variant.id)}
          >
            Delete
          </Button>
        </li>
      ))}
    </ul>
  )
}
