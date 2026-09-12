import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button, Input } from "@renderer/design-system"
import type { GenerationRecord } from "@renderer/lib/trpc"
import { GenerationFields } from "./generation-fields"

/** How long the Copy button says it has copied. */
const COPIED_MS = 2000

/** The shortest body the guide asks of a generation task. */
const SHORTEST_BODY = 350

/** How many words the model wrote in the part that carries the scene. */
function bodyWords(generation: GenerationRecord): number {
  const body = generation.fields.integrated_multimodal_description ?? ""
  return body.split(/\s+/).filter(Boolean).length
}

/** What can be done to any finished prompt, wherever it is shown. */
export interface PromptActionProps {
  isEditing: boolean
  isExporting: boolean
  onEdit: (generationId: number, instruction: string) => void
  onExport: (generationId: number) => void
  onSave: (generationId: number) => void
  onOpenExports: () => void
}

interface PromptResultProps extends PromptActionProps {
  generation: GenerationRecord
}

/** One generated prompt, ready to copy, to edit into another, or to write out to a file. */
export function PromptResult({
  generation,
  isEditing,
  isExporting,
  onEdit,
  onExport,
  onSave,
  onOpenExports,
}: PromptResultProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [instruction, setInstruction] = useState("")

  useEffect(() => {
    const timer = copied ? setTimeout(() => setCopied(false), COPIED_MS) : undefined
    return () => clearTimeout(timer)
  }, [copied])

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(generation.rendered)
    setCopied(true)
  }

  const trimmedInstruction = instruction.trim()

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">{generation.clipNote}</p>
          <p className="text-xs text-muted-foreground">
            {[new Date(generation.createdAt).toLocaleString(), generation.model]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {generation.editInstruction && (
            <p className="text-xs text-muted-foreground">Edited: {generation.editInstruction}</p>
          )}
          {bodyWords(generation) > 0 && (
            <p
              className={
                bodyWords(generation) < SHORTEST_BODY
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {bodyWords(generation)} words
              {bodyWords(generation) < SHORTEST_BODY
                ? `, short of the ${SHORTEST_BODY} a generation wants`
                : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={() => onExport(generation.id)}
          >
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={() => onSave(generation.id)}
          >
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenExports}>
            Open folder
          </Button>
        </div>
      </header>

      <GenerationFields generation={generation} />

      <div className="flex min-w-0 flex-col gap-1">
        {/* The prompt copies from anywhere on it, the same as the fields above. */}
        <button
          type="button"
          aria-label="Copy the prompt"
          title="Copy the prompt"
          className="flex w-full min-w-0 flex-col gap-1 rounded px-1 py-1 text-left hover:bg-accent"
          onClick={() => void copy()}
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="font-heading text-sm font-semibold text-muted-foreground">Prompt</span>
            {copied ? (
              <Check className="size-3.5 text-muted-foreground" />
            ) : (
              <Copy className="size-3.5 text-muted-foreground" />
            )}
          </span>
          <pre className="w-full text-sm whitespace-pre-wrap text-muted-foreground">
            {generation.rendered}
          </pre>
        </button>
      </div>

      <form
        className="flex min-w-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmedInstruction.length === 0) return
          onEdit(generation.id, trimmedInstruction)
          setInstruction("")
        }}
      >
        <Input
          className="min-w-0"
          aria-label={`Change to make to prompt ${generation.id}`}
          placeholder="She is happier, and the whole scene is faster"
          value={instruction}
          disabled={isEditing}
          onChange={(event) => setInstruction(event.target.value)}
        />
        <Button type="submit" disabled={isEditing || trimmedInstruction.length === 0}>
          {isEditing ? "Editing…" : "Edit"}
        </Button>
      </form>
    </article>
  )
}
