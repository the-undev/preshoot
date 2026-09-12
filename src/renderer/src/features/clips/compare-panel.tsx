import { useState } from "react"
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/design-system"
import type { GenerationRecord, PromptVariant, RunSummary } from "@renderer/lib/trpc"
import type { ComposerOption } from "./use-generate-clip"
import type { ComparePair, RunFailure } from "./use-compare"

interface ComparePanelProps {
  composers: ComposerOption[]
  variants: PromptVariant[]
  pairs: ComparePair[]
  runs: RunSummary[]
  runId: string | null
  results: GenerationRecord[]
  failure: RunFailure | null
  isPending: boolean
  onAddPair: (pair: ComparePair) => void
  onRemovePair: (index: number) => void
  onRun: () => void
  onChooseRun: (runId: string) => void
  onVerdict: (generationId: number, verdict: "good" | "bad" | null) => void
  onNote: (generationId: number, note: string) => void
}

/** Writes the same clip several ways and puts the results next to each other. */
export function ComparePanel({
  composers,
  variants,
  pairs,
  runs,
  runId,
  results,
  failure,
  isPending,
  onAddPair,
  onRemovePair,
  onRun,
  onChooseRun,
  onVerdict,
  onNote,
}: ComparePanelProps): React.JSX.Element {
  const [composerId, setComposerId] = useState(composers[0]?.id ?? "")
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "")

  const nameOfComposer = (id: string): string =>
    composers.find((composer) => composer.id === id)?.name ?? id
  const nameOfVariant = (id: string | null): string =>
    variants.find((variant) => variant.id === id)?.name ?? "built-in prompt"

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-sm font-semibold text-muted-foreground">Compare</h2>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="compare-composer">Way</Label>
          <Select value={composerId} onValueChange={setComposerId}>
            <SelectTrigger id="compare-composer" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {composers.map((composer) => (
                <SelectItem key={composer.id} value={composer.id}>
                  {composer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="compare-variant">Prompt</Label>
          <Select value={variantId} onValueChange={setVariantId}>
            <SelectTrigger id="compare-variant" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variants.map((variant) => (
                <SelectItem key={variant.id} value={variant.id}>
                  {variant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => onAddPair({ composerId, variantId: variantId || null })}
        >
          Add to run
        </Button>
      </div>

      {pairs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add two or more ways of writing this clip to compare them.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {pairs.map((pair, index) => (
            <li
              key={`${pair.composerId}:${pair.variantId}:${index}`}
              className="flex items-center gap-2"
            >
              <span className="flex-1 text-sm">
                {nameOfComposer(pair.composerId)} · {nameOfVariant(pair.variantId)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${nameOfComposer(pair.composerId)} from the run`}
                onClick={() => onRemovePair(index)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button onClick={onRun} disabled={pairs.length < 2 || isPending}>
          {isPending ? "Running…" : "Run comparison"}
        </Button>
      </div>

      {failure && (
        <p className="text-xs text-destructive">
          Stopped at {nameOfComposer(failure.composerId)}: {failure.message}
        </p>
      )}

      {runs.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="compare-run">Run</Label>
          <Select value={runId ?? ""} onValueChange={onChooseRun}>
            <SelectTrigger id="compare-run" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {runs.map((run) => (
                <SelectItem key={run.runId} value={run.runId}>
                  {new Date(run.ranAt).toLocaleString()} · {run.written} written · {run.good} good
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-4">
          {results.map((result) => (
            <CompareResult
              key={result.id}
              result={result}
              composerName={nameOfComposer(result.composer)}
              variantName={nameOfVariant(result.promptVariantId)}
              onVerdict={onVerdict}
              onNote={onNote}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface CompareResultProps {
  result: GenerationRecord
  composerName: string
  variantName: string
  onVerdict: (generationId: number, verdict: "good" | "bad" | null) => void
  onNote: (generationId: number, note: string) => void
}

/** One result of a run, with what wrote it and what was made of it. */
function CompareResult({
  result,
  composerName,
  variantName,
  onVerdict,
  onNote,
}: CompareResultProps): React.JSX.Element {
  const [note, setNote] = useState(result.note)

  return (
    <article className="flex flex-col gap-2 rounded-lg border p-4">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-medium">{composerName}</span>
        <span className="text-xs text-muted-foreground">{variantName}</span>
      </header>

      <pre className="max-h-64 overflow-y-auto text-xs whitespace-pre-wrap text-muted-foreground">
        {result.rendered}
      </pre>

      <div className="flex items-center gap-2">
        <Button
          variant={result.verdict === "good" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={result.verdict === "good"}
          onClick={() => onVerdict(result.id, result.verdict === "good" ? null : "good")}
        >
          Good
        </Button>
        <Button
          variant={result.verdict === "bad" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={result.verdict === "bad"}
          onClick={() => onVerdict(result.id, result.verdict === "bad" ? null : "bad")}
        >
          Bad
        </Button>
        <Input
          aria-label={`Note on ${composerName}`}
          placeholder="What was wrong with it"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => onNote(result.id, note)}
        />
      </div>
    </article>
  )
}
