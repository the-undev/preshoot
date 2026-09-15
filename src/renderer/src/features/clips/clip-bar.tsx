import { Copy, Pencil, Save, SlidersHorizontal } from "lucide-react"
import { Button } from "@renderer/design-system"
import type { AspectRatio, ClipComposition, OpenTab } from "@renderer/lib/trpc"
import { pixelSize } from "./resolution"
import { tabTitle } from "./tab-title"

/** What the model calls each form in the task field of a request. */
const TASKS: Record<string, string> = {
  t2v: "t2va",
  i2v: "i2va",
  fl2v: "fl2va",
  l2v: "l2va",
}

/** What the clip generates at, in the few words that fit beside its name. */
function settingsChips(composition: ClipComposition, shapes: AspectRatio[]): string[] {
  const shape = shapes.find((entry) => entry.value === composition.aspectRatio)
  const size = shape ? pixelSize(composition.shortEdge, shape) : null
  return [
    TASKS[composition.form] ?? composition.form,
    composition.aspectRatio,
    size ? `${size.width} × ${size.height}` : "",
    composition.style,
  ].filter((chip) => chip.length > 0)
}

interface ClipBarProps {
  tab: OpenTab
  composition: ClipComposition
  aspectRatios: AspectRatio[]
  isSaving: boolean
  onSave: () => void
  onBranch: () => void
  onSettings: () => void
}

/**
 * What the open clip is called and what can be done to it as a whole, kept out of the editor
 * because renaming, saving and branching are about the clip rather than about its contents.
 */
export function ClipBar({
  tab,
  composition,
  aspectRatios,
  isSaving,
  onSave,
  onBranch,
  onSettings,
}: ClipBarProps): React.JSX.Element {
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
          <span className="shrink-0 text-xs text-muted-foreground">based on {tab.savedFrom}</span>
        )}

        {/* What the clip generates at, always in sight, and one click from being changed. */}
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          {settingsChips(composition, aspectRatios).map((chip) => (
            <Button
              key={chip}
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-2 font-mono text-xs text-muted-foreground"
              aria-label={`Clip settings: ${chip}`}
              onClick={onSettings}
            >
              {chip}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          title="What this clip is generated at (Ctrl and comma)"
          onClick={onSettings}
        >
          <SlidersHorizontal className="size-4" />
          Settings
        </Button>

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
