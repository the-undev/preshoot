import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Alert, AlertDescription, Button } from "@renderer/design-system"
import type { ClipPrompt, GenerationRequest } from "@renderer/lib/trpc"

/** How long a copy button says it has copied. */
const COPIED_MS = 2000

/** One thing a generation needs, as it is set wherever the model runs. */
interface Field {
  name: string
  value: string
  note?: string
}

/**
 * What a generation needs besides its prompt, in the order it is usually filled in. The prompt
 * itself is shown whole below rather than as a line here, and goes into the block all the same.
 */
function fieldsOf(request: GenerationRequest): Field[] {
  return [
    { name: "Type", value: request.task },
    { name: "Duration", value: `${request.durationSeconds}`, note: "seconds" },
    { name: "Width", value: `${request.width}`, note: "pixels" },
    { name: "Height", value: `${request.height}`, note: "pixels" },
    { name: "Aspect ratio", value: request.aspectRatio },
    ...request.conditions.map((condition) => ({
      name: condition.at === "first frame" ? "First frame" : "Last frame",
      value: condition.fileName,
      note: `${condition.fromAsset}, exported beside the prompt`,
    })),
  ]
}

/** The same fields and the prompt as one block, for pasting somewhere that takes them together. */
function asBlock(fields: Field[], prompt: string): string {
  return [...fields.map((field) => `${field.name}: ${field.value}`), `Prompt: ${prompt}`].join(
    "\n\n"
  )
}

interface ClipPromptPanelProps {
  prompt: ClipPrompt
  isExporting: boolean
  exportedTo: string | null
  errorMessage: string | null
  onExport: () => void
  onSave: () => void
  onOpenExports: () => void
}

/**
 * The prompt this clip makes, rewritten on every change. Nothing here submits: there is nowhere
 * yet to submit it to, so every field copies on its own.
 */
export function ClipPromptPanel({
  prompt,
  isExporting,
  exportedTo,
  errorMessage,
  onExport,
  onSave,
  onOpenExports,
}: ClipPromptPanelProps): React.JSX.Element {
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const timer = copied ? setTimeout(() => setCopied(null), COPIED_MS) : undefined
    return () => clearTimeout(timer)
  }, [copied])

  async function copy(name: string, value: string): Promise<void> {
    await navigator.clipboard.writeText(value)
    setCopied(name)
  }

  if (!prompt.ready) {
    return (
      <p className="text-sm text-muted-foreground">
        {prompt.reason} The prompt appears here as the clip is filled in.
      </p>
    )
  }

  const fields = fieldsOf(prompt.request)
  const short = prompt.body.words < prompt.body.min
  const long = prompt.body.words > prompt.body.max

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-semibold text-muted-foreground">
            What this needs
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copy("all", asBlock(fields, prompt.rendered))}
          >
            {copied === "all" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copy all
          </Button>
        </div>

        <ul className="flex min-w-0 flex-col gap-1">
          {fields.map((field) => (
            <li key={field.name} className="border-b last:border-b-0">
              {/* The whole line copies, not just the icon, since the line is what you are reaching
                  for. One button per row, so nothing is nested inside anything clickable. */}
              <button
                type="button"
                aria-label={`Copy ${field.name}`}
                title={`Copy ${field.name}`}
                className="flex w-full min-w-0 items-baseline gap-2 rounded px-1 py-1.5 text-left hover:bg-accent"
                onClick={() => void copy(field.name, field.value)}
              >
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{field.name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{field.value}</span>
                {field.note && (
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {field.note}
                  </span>
                )}
                {copied === field.name ? (
                  <Check className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Copy className="size-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="font-heading text-sm font-semibold text-muted-foreground">Prompt</h3>
            <span className={short ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {prompt.body.words} words
              {short ? `, short of the ${prompt.body.min} the model wants` : ""}
              {long ? `, past the ${prompt.body.max} the model wants` : ""}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void copy("prompt", prompt.rendered)}>
            {copied === "prompt" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copy
          </Button>
        </div>
        <pre className="min-w-0 rounded border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
          {prompt.rendered}
        </pre>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={isExporting} onClick={onExport}>
          Write into the project
        </Button>
        <Button variant="outline" size="sm" disabled={isExporting} onClick={onSave}>
          Save as…
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenExports}>
          Open the exports folder
        </Button>
      </section>

      {exportedTo && <p className="text-xs text-muted-foreground">Written to {exportedTo}</p>}

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
