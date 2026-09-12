import { useEffect, useState } from "react"
import { Button } from "@renderer/design-system"
import type { GenerationRecord } from "@renderer/lib/trpc"

/** How long the Copy button says it has copied. */
const COPIED_MS = 2000

interface PromptResultProps {
  generation: GenerationRecord
}

/** One generated prompt with the brief it came from, ready to copy into the H3 web form. */
export function PromptResult({ generation }: PromptResultProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timer = copied ? setTimeout(() => setCopied(false), COPIED_MS) : undefined
    return () => clearTimeout(timer)
  }, [copied])

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(generation.rendered)
    setCopied(true)
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">{generation.brief}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(generation.createdAt).toLocaleString()} · {generation.model}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </header>
      <pre className="text-sm whitespace-pre-wrap text-muted-foreground">{generation.rendered}</pre>
    </article>
  )
}
