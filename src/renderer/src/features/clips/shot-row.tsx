import { useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "lucide-react"
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  FieldHelp,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/design-system"
import type { Asset, ShotComposition, SubjectComposition, Vocabularies } from "@renderer/lib/trpc"
import { Chip } from "./chip"
import { asLineInput } from "./line-input"
import { ShotLines } from "./shot-lines"
import type { ShotFields } from "./use-clip"

/** Stands for "nothing chosen", since a picker cannot hold an empty value. */
const NOT_SET = "not-set"

/** The shortest a shot can be, which is what the router accepts. */
const MIN_SHOT_MS = 100

interface ShotRowProps {
  shot: ShotComposition
  index: number
  speakers: SubjectComposition[]
  library: Asset[]
  vocabularies: Vocabularies
  onChange: (fields: ShotFields) => void
  onRemove: () => void
  onSave: () => void
  onAddPeople: () => void
}

/** One shot of the clip: how long it runs, how it is shot, what it shows and what is said. */
export function ShotRow({
  shot,
  index,
  speakers,
  library,
  vocabularies,
  onChange,
  onRemove,
  onSave,
  onAddPeople,
}: ShotRowProps): React.JSX.Element {
  const [open, setOpen] = useState(index === 0)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shot.id,
  })
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
      soundNote,
      things: shot.things.map((thing) => thing.id),
      lines: shot.lines.map(asLineInput),
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
        <header className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Reorder shot ${index + 1}`}
            className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>

          <CollapsibleTrigger asChild>
            {/* A plain button: the design system's refuses to shrink, so the summary ran under
                the buttons beside it rather than being cut short. */}
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
            >
              {open ? (
                <ChevronDown className="size-4 shrink-0" />
              ) : (
                <ChevronRight className="size-4 shrink-0" />
              )}
              <span className="shrink-0 font-heading text-sm font-semibold">Shot {index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {summary(shot)}
              </span>
            </button>
          </CollapsibleTrigger>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Save shot ${index + 1} to the library`}
              onClick={onSave}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onRemove}
              aria-label={`Remove shot ${index + 1}`}
            >
              <Trash2 className="size-4" />
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
            <span className="text-sm font-medium">Subjects</span>
            {library.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  The people, places and objects a shot holds live in the library. Add them there
                  and they can be put in this shot.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={onAddPeople}>
                  Open the library
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {library.map((asset) => {
                  const shown = shot.things.some((thing) => thing.id === asset.id)
                  return (
                    <Chip
                      key={asset.id}
                      chosen={shown}
                      label={asset.name}
                      onToggle={() =>
                        commit({
                          things: shown
                            ? shot.things.filter((thing) => thing.id !== asset.id).map((t) => t.id)
                            : [...shot.things.map((thing) => thing.id), asset.id],
                        })
                      }
                    >
                      {asset.name}
                    </Chip>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">What happens</span>
              <FieldHelp label="what happens">
                One thing at a time, in the order it happens, with what is said among it. Enter
                makes the next line and backspace on an empty one takes it away.
              </FieldHelp>
            </div>
            <ShotLines
              shotId={shot.id}
              lines={shot.lines}
              subjects={library.filter((asset) =>
                shot.things.some((thing) => thing.id === asset.id)
              )}
              speakers={speakers}
              onChange={(lines) => commit({ lines })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={id("sound")}>Sound</Label>
              <FieldHelp label="sound">
                What is heard in this shot that nobody says: weather, footfalls, machinery,
                breathing. The sound of every shot is gathered into one field of the prompt.
              </FieldHelp>
            </div>
            <Input
              id={id("sound")}
              value={soundNote}
              onChange={(event) => setSoundNote(event.target.value)}
              onBlur={() => commit({ soundNote })}
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
  const first = shot.lines.find((line) => line.text.trim().length > 0)?.text.trim()
  return [seconds, shot.cameraMotion, first].filter(Boolean).join(" · ")
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
