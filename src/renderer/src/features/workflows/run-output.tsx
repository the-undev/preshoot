import { Check, X } from "lucide-react"
import { Input } from "@renderer/design-system"
import { fileName } from "@renderer/lib/file-name"
import { outputFileUrl, type RunOutput, type Verdict } from "@renderer/lib/trpc"

interface RunOutputItemProps {
  output: RunOutput
  onOpen: () => void
  onSetVerdict: (verdict: Verdict | null) => void
  onSetNote: (note: string) => void
}

/** One file a run wrote: a preview of it, its verdict buttons, and its note once it has a verdict. */
export function RunOutputItem({
  output,
  onOpen,
  onSetVerdict,
  onSetNote,
}: RunOutputItemProps): React.JSX.Element {
  const name = fileName(output.path)
  const showNote = output.verdict !== null || output.note.length > 0
  return (
    <li className="flex w-80 max-w-full flex-col gap-1">
      <OutputPreview output={output} name={name} onOpen={onOpen} />
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{name}</span>
        <VerdictButton
          label="Mark good"
          pressed={output.verdict === "good"}
          pressedClassName="border-chosen bg-chosen text-chosen-foreground"
          onClick={() => onSetVerdict(output.verdict === "good" ? null : "good")}
        >
          <Check className="size-3.5" />
        </VerdictButton>
        <VerdictButton
          label="Mark bad"
          pressed={output.verdict === "bad"}
          pressedClassName="border-destructive bg-destructive text-white"
          onClick={() => onSetVerdict(output.verdict === "bad" ? null : "bad")}
        >
          <X className="size-3.5" />
        </VerdictButton>
      </div>
      {showNote && (
        // Keyed on the saved note, so a note saved elsewhere replaces what the field holds.
        <Input
          key={output.note}
          aria-label={`Note on ${name}`}
          placeholder="Note"
          defaultValue={output.note}
          className="h-7 text-xs"
          onBlur={(event) => {
            const note = event.currentTarget.value.trim()
            if (note !== output.note) onSetNote(note)
          }}
        />
      )}
    </li>
  )
}

/** A picture, video or sound shown in place, or a row that opens anything else outside the app. */
function OutputPreview({
  output,
  name,
  onOpen,
}: {
  output: RunOutput
  name: string
  onOpen: () => void
}): React.JSX.Element {
  if (output.media === "image") {
    return (
      <button type="button" aria-label={`Open ${name}`} onClick={onOpen} className="text-left">
        <img
          src={outputFileUrl(output.path, 320)}
          alt={name}
          className="max-h-60 w-full rounded border object-contain"
        />
      </button>
    )
  }
  if (output.media === "video") {
    return (
      <video
        src={outputFileUrl(output.path)}
        aria-label={name}
        controls
        preload="metadata"
        className="max-h-60 w-full rounded border bg-black"
      />
    )
  }
  if (output.media === "audio") {
    return <audio src={outputFileUrl(output.path)} aria-label={name} controls className="w-full" />
  }
  return (
    <button
      type="button"
      className="truncate text-left text-sm underline-offset-4 hover:underline"
      aria-label={`Open ${name}`}
      onClick={onOpen}
    >
      {name}
    </button>
  )
}

/**
 * A small toggle for one verdict. A plain button rather than the design system's, whose variants
 * set their own background and would win over the pressed colour.
 */
function VerdictButton({
  label,
  pressed,
  pressedClassName,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  pressedClassName: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={`flex size-6 items-center justify-center rounded-md border ${
        pressed ? pressedClassName : "border-input text-muted-foreground hover:bg-muted/50"
      }`}
    >
      {children}
    </button>
  )
}
