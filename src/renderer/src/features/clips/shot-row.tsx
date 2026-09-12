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
  Textarea,
} from "@renderer/design-system"
import type {
  Asset,
  DialogueLine,
  ShotComposition,
  SpeakerComposition,
  Vocabularies,
} from "@renderer/lib/trpc"
import { ShotDialogue } from "./shot-dialogue"
import type { ShotFields } from "./use-clip"

/** Stands for "nothing chosen", since a picker cannot hold an empty value. */
const NOT_SET = "not-set"

interface ShotRowProps {
  shot: ShotComposition
  index: number
  isFirst: boolean
  isLast: boolean
  speakers: SpeakerComposition[]
  library: Asset[]
  vocabularies: Vocabularies
  canRegenerate: boolean
  isBusy: boolean
  onChange: (fields: ShotFields) => void
  onMove: (toPosition: number) => void
  onRemove: () => void
  onRegenerate: () => void
}

/** One shot of the clip: how long it runs, how it is shot, what it shows and what is said. */
export function ShotRow({
  shot,
  index,
  isFirst,
  isLast,
  speakers,
  library,
  vocabularies,
  canRegenerate,
  isBusy,
  onChange,
  onMove,
  onRemove,
  onRegenerate,
}: ShotRowProps): React.JSX.Element {
  const [action, setAction] = useState(shot.action)
  const [soundNote, setSoundNote] = useState(shot.soundNote)

  /** The whole shot as it stands, with `over` applied, which is what the router expects back. */
  function commit(over: Partial<ShotFields>): void {
    onChange({
      durationMs: shot.durationMs,
      cameraMotion: shot.cameraMotion,
      amplitude: shot.amplitude,
      speed: shot.speed,
      transition: shot.transition,
      lighting: shot.lighting,
      action,
      soundNote,
      things: shot.things.map((thing) => thing.id),
      dialogue: shot.dialogue,
      ...over,
    })
  }

  const id = (field: string): string => `shot-${shot.id}-${field}`

  return (
    <article className="flex flex-col gap-4 rounded-lg border p-4">
      <header className="flex items-center justify-between gap-4">
        <h3 className="font-heading text-sm font-semibold">Shot {index + 1}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={isFirst}
            onClick={() => onMove(index - 1)}
            aria-label={`Move shot ${index + 1} earlier`}
          >
            Up
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isLast}
            onClick={() => onMove(index + 1)}
            aria-label={`Move shot ${index + 1} later`}
          >
            Down
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canRegenerate || isBusy}
            onClick={onRegenerate}
            aria-label={`Write shot ${index + 1} again`}
          >
            Regenerate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove shot ${index + 1}`}
          >
            Remove
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={id("duration")}>Seconds</Label>
          <Input
            id={id("duration")}
            type="number"
            min={0.1}
            step={0.1}
            value={shot.durationMs / 1000}
            onChange={(event) =>
              commit({ durationMs: Math.round(Number(event.target.value) * 1000) })
            }
          />
        </div>

        <Picker
          id={id("motion")}
          label="Camera motion"
          value={shot.cameraMotion}
          options={vocabularies.cameraMotions}
          onChange={(cameraMotion) => commit({ cameraMotion })}
        />
        <Picker
          id={id("amplitude")}
          label="Amplitude"
          value={shot.amplitude}
          options={vocabularies.amplitudes}
          onChange={(amplitude) => commit({ amplitude })}
        />
        <Picker
          id={id("speed")}
          label="Speed"
          value={shot.speed}
          options={vocabularies.speeds}
          onChange={(speed) => commit({ speed })}
        />
        {!isFirst && (
          <Picker
            id={id("transition")}
            label="Cut into it with"
            value={shot.transition}
            options={vocabularies.transitions}
            onChange={(transition) => commit({ transition })}
          />
        )}
        <Picker
          id={id("lighting")}
          label="Lighting"
          value={shot.lighting}
          options={vocabularies.lightings}
          onChange={(lighting) => commit({ lighting })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={id("action")}>What happens</Label>
        <Textarea
          id={id("action")}
          rows={2}
          value={action}
          placeholder="climbs the last steps of the tower and reaches for the lamp"
          onChange={(event) => setAction(event.target.value)}
          onBlur={() => commit({ action })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={id("sound")}>Sound</Label>
        <Input
          id={id("sound")}
          value={soundNote}
          placeholder="wind battering the glass"
          onChange={(event) => setSoundNote(event.target.value)}
          onBlur={() => commit({ soundNote })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Shows</span>
        {library.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            The library is empty, so this shot has nothing to show yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {library.map((asset) => {
              const shown = shot.things.some((thing) => thing.id === asset.id)
              return (
                <Button
                  key={asset.id}
                  variant={shown ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={shown}
                  onClick={() =>
                    commit({
                      things: shown
                        ? shot.things.filter((thing) => thing.id !== asset.id).map((t) => t.id)
                        : [...shot.things.map((thing) => thing.id), asset.id],
                    })
                  }
                >
                  {asset.name}
                </Button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Dialogue</span>
        <ShotDialogue
          shotId={shot.id}
          lines={shot.dialogue}
          speakers={speakers}
          onChange={(dialogue: DialogueLine[]) => commit({ dialogue })}
        />
      </div>
    </article>
  )
}

interface PickerProps {
  id: string
  label: string
  value: string | null
  options: readonly string[]
  onChange: (value: string | null) => void
}

/** One word from the target's vocabulary, or nothing at all. */
function Picker({ id, label, value, options, onChange }: PickerProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? NOT_SET}
        onValueChange={(next) => onChange(next === NOT_SET ? null : next)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_SET}>Not set</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
