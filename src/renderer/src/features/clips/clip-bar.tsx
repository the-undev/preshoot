import { Copy, Pencil, Save } from "lucide-react"
import { Button } from "@renderer/design-system"
import type { OpenTab } from "@renderer/lib/trpc"
import { tabTitle } from "./tab-title"

interface ClipBarProps {
  tab: OpenTab
  isSaving: boolean
  onSave: () => void
  onBranch: () => void
}

/**
 * What the open clip is called and what can be done to it as a whole, kept out of the editor
 * because renaming, saving and branching are about the clip rather than about its contents.
 */
export function ClipBar({ tab, isSaving, onSave, onBranch }: ClipBarProps): React.JSX.Element {
  const saved = tab.clipName !== null

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b px-6 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 gap-2 font-medium"
          aria-label={saved ? `Rename ${tab.clipName}` : "Save this clip"}
          onClick={onSave}
        >
          <span className="truncate">{tabTitle(tab)}</span>
          {saved ? (
            <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">not saved</span>
          )}
        </Button>

        {tab.savedFrom !== null && (
          <span className="truncate text-xs text-muted-foreground">based on {tab.savedFrom}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={isSaving}
          title="Save this clip under a name (Ctrl and S)"
          onClick={onSave}
        >
          <Save className="size-4" />
          Save
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={isSaving}
          title="Open a copy in a new tab, leaving this one alone (Ctrl and D)"
          onClick={onBranch}
        >
          <Copy className="size-4" />
          Branch
        </Button>
      </div>
    </div>
  )
}
