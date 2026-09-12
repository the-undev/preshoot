import { useEffect, useState } from "react"
import { Button } from "@renderer/design-system"
import type { GenerationRecord } from "@renderer/lib/trpc"

/** How long a copy button says it has copied. */
const COPIED_MS = 2000

/** One thing a generation needs, as it is set wherever the model runs. */
interface Field {
  name: string
  value: string
  note?: string
}

/**
 * What this generation needs besides its prompt, in the order it is usually filled in. The prompt
 * itself is shown whole below rather than as a line here, and goes into the block all the same.
 */
function fieldsOf(generation: GenerationRecord): Field[] {
  const request = generation.request
  if (!request) {
    return []
  }

  return [
    { name: "Type", value: request.task },
    { name: "Duration", value: `${request.durationSeconds}`, note: "seconds" },
    { name: "Shape", value: request.aspectRatio, note: request.aspectRatioName },
    { name: "Short edge", value: `${request.shortEdge}`, note: "pixels" },
    { name: "Seed", value: `${request.seed}` },
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

interface GenerationFieldsProps {
  generation: GenerationRecord
}

/**
 * Everything a generation needs, each field on its own so it can go into whatever runs the model.
 * Nothing here submits: there is nowhere yet to submit it to.
 */
export function GenerationFields({ generation }: GenerationFieldsProps): React.JSX.Element {
  const [copied, setCopied] = useState<string | null>(null)
  const fields = fieldsOf(generation)

  useEffect(() => {
    const timer = copied ? setTimeout(() => setCopied(null), COPIED_MS) : undefined
    return () => clearTimeout(timer)
  }, [copied])

  async function copy(name: string, value: string): Promise<void> {
    await navigator.clipboard.writeText(value)
    setCopied(name)
  }

  // A result written before the request was kept has nothing to say here.
  if (fields.length === 0) {
    return <></>
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold text-muted-foreground">
          What this needs
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copy("all", asBlock(fields, generation.rendered))}
        >
          {copied === "all" ? "Copied" : "Copy all"}
        </Button>
      </div>

      <dl className="flex min-w-0 flex-col gap-1">
        {fields.map((field) => (
          <div
            key={field.name}
            className="flex min-w-0 items-baseline gap-2 border-b py-1 last:border-b-0"
          >
            <dt className="w-28 shrink-0 text-xs text-muted-foreground">{field.name}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-xs">{field.value}</dd>
            {field.note && (
              <span className="shrink-0 text-xs text-muted-foreground">{field.note}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label={`Copy ${field.name}`}
              onClick={() => void copy(field.name, field.value)}
            >
              {copied === field.name ? "Copied" : "Copy"}
            </Button>
          </div>
        ))}
      </dl>
    </section>
  )
}
