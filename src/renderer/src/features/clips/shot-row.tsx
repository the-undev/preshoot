import { useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react"
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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

/** The shortest a shot can be, which is what the router accepts. */
const MIN_SHOT_MS = 100

interface ShotRowProps {
  shot: ShotComposition
  index: number
  speakers: SpeakerComposition[]
  library: Asset[]
  vocabularies: Vocabularies
  canRegenerate: boolean
  isBusy: boolean
  onChange: (fields: ShotFields) => void
  onRemove: () => void
  onRegenerate: () => void
}

/** One shot of the clip: how long it runs, how it is shot, what it shows and what is said. */
export function ShotRow({
  shot,
  index,
  speakers,
  library,
  vocabularies,
  canRegenerate,
  isBusy,
  onChange,
  onRemove,
  onRegenerate,
}: ShotRowProps): React.JSX.Element {
  const [open, setOpen] = useState(index === 0)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shot.id,
  })
  const [action, setAction] = useState(shot.action)
  const [soundNote, setSoundNote] = useState(shot.soundNote)
  const [seconds, setSeconds] = useState(String(shot.durationMs / 1000))

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
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex min-w-0 flex-col gap-4 rounded-lg border p-4 ${isDragging ? "opacity-60" : ""}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <header className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              aria-label={`Reorder shot ${index + 1}`}
              className="cursor-grab rounded p-1 text-muted-foreground hover:text-foreground"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-auto min-w-0 justify-start px-2 py-1">
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <span className="font-heading text-sm font-semibold">Shot {index + 1}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {summary(shot)}
                </span>
              </Button>
            </CollapsibleTrigger>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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

        <CollapsibleContent className="flex flex-col gap-4 pt-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={id("duration")}>Seconds</Label>
              <Input
                id={id("duration")}
                type="number"
                min={0.1}
                step={0.1}
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
                onBlur={() => {
                  // An emptied or nonsense box is not a length, so the shot keeps the one it had.
                  const typed = Number(seconds)
                  const durationMs = Number.isFinite(typed) ? Math.round(typed * 1000) : 0
                  if (durationMs < MIN_SHOT_MS) {
                    setSeconds(String(shot.durationMs / 1000))
                    return
                  }
                  commit({ durationMs })
                }}
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
            {index > 0 && (
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
        </CollapsibleContent>
      </Collapsible>
    </article>
  )
}

/** What a shot is, in one line, for when it is collapsed. */
function summary(shot: ShotComposition): string {
  const seconds = `${(shot.durationMs / 1000).toFixed(1)}s`
  const action = shot.action.trim()
  return [seconds, shot.cameraMotion, action].filter(Boolean).join(" · ")
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
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? NOT_SET}
        onValueChange={(next) => onChange(next === NOT_SET ? null : next)}
      >
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue className="truncate" />
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
