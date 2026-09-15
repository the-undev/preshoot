import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/design-system"
import type { Asset, ShotComposition } from "@renderer/lib/trpc"

/** Stands for a beat that belongs to the scene rather than to one of the subjects. */
const NOBODY = "nobody"

/** One beat as the editor sends it back. */
export interface BeatInput {
  assetId: number | null
  text: string
}

interface ShotBeatsProps {
  shotId: number
  beats: ShotComposition["beats"]
  subjects: Asset[]
  onChange: (beats: BeatInput[]) => void
}

/** What happens in a shot, in order, each beat done by one of its subjects or by nobody. */
export function ShotBeats({
  shotId,
  beats,
  subjects,
  onChange,
}: ShotBeatsProps): React.JSX.Element {
  // What is being typed, until it is written and comes back, the same as a line of dialogue.
  const [draft, setDraft] = useState<{ from: string; beats: BeatInput[] } | null>(null)
  const written = JSON.stringify(beats)
  const shown: BeatInput[] =
    draft?.from === written
      ? draft.beats
      : beats.map((beat) => ({
          assetId: subjects.find((subject) => subject.name === beat.subjectName)?.id ?? null,
          text: beat.text,
        }))

  const replace = (index: number, beat: BeatInput): void => {
    setDraft({
      from: written,
      beats: shown.map((existing, at) => (at === index ? beat : existing)),
    })
  }

  const commit = (): void => {
    if (draft?.from === written) onChange(draft.beats)
  }

  const move = (index: number, to: number): void => {
    const ordered = [...shown]
    const [beat] = ordered.splice(index, 1)
    ordered.splice(to, 0, beat)
    onChange(ordered)
  }

  return (
    <div className="flex flex-col gap-2">
      {shown.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing happens in this shot yet. Add what happens, one thing at a time, in the order it
          happens.
        </p>
      )}

      {shown.map((beat, index) => (
        <div key={index} className="flex min-w-0 flex-wrap items-center gap-2">
          <Select
            value={beat.assetId === null ? NOBODY : String(beat.assetId)}
            onValueChange={(value) =>
              onChange(
                shown.map((existing, at) =>
                  at === index
                    ? { ...existing, assetId: value === NOBODY ? null : Number(value) }
                    : existing
                )
              )
            }
          >
            <SelectTrigger aria-label={`Who beat ${index + 1} is about`} className="w-40 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>The scene</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={String(subject.id)}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="min-w-40 flex-1"
            aria-label={`Beat ${index + 1} of shot ${shotId}`}
            value={beat.text}
            onChange={(event) => replace(index, { ...beat, text: event.target.value })}
            onBlur={commit}
          />

          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={index === 0}
            aria-label={`Move beat ${index + 1} earlier`}
            onClick={() => move(index, index - 1)}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={index === shown.length - 1}
            aria-label={`Move beat ${index + 1} later`}
            onClick={() => move(index, index + 1)}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove beat ${index + 1}`}
            onClick={() => onChange(shown.filter((_, at) => at !== index))}
          >
            Remove
          </Button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...shown, { assetId: null, text: "" }])}
        >
          Add what happens
        </Button>
      </div>
    </div>
  )
}
