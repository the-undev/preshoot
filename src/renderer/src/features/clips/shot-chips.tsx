import { useState } from "react"
import { Plus } from "lucide-react"
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@renderer/design-system"
import type { ShotComposition, Vocabularies } from "@renderer/lib/trpc"
import type { ShotFields } from "./use-clip"

/** The shortest a shot can be, which is what the router accepts. */
const MIN_SHOT_MS = 100

/** One thing about a shot that is picked from the target's vocabulary. */
interface ChipField {
  key: "cameraMotion" | "amplitude" | "speed" | "transition" | "lighting"
  label: string
  options: (vocabularies: Vocabularies) => readonly string[]
  /** Whether it says how the camera moves, which is nothing at all without a move to say it of. */
  modifiesTheMove?: true
}

const FIELDS: ChipField[] = [
  { key: "cameraMotion", label: "Camera", options: (v) => v.cameraMotions },
  { key: "amplitude", label: "Amplitude", options: (v) => v.amplitudes, modifiesTheMove: true },
  { key: "speed", label: "Speed", options: (v) => v.speeds, modifiesTheMove: true },
  { key: "transition", label: "Cut", options: (v) => v.transitions },
  { key: "lighting", label: "Lighting", options: (v) => v.lightings },
]

/** A vocabulary word short enough for a chip. The words are written to sit inside a sentence. */
function chipLabel(value: string): string {
  return value.replace(/^(with|at|the) /, "")
}

interface ShotChipsProps {
  shot: ShotComposition
  index: number
  vocabularies: Vocabularies
  onChange: (over: Partial<ShotFields>) => void
}

/**
 * How a shot is shot, as chips rather than as a row of pickers. Only what has been set shows,
 * so a shot nobody has touched reads as its length alone, and the plus offers the rest.
 */
export function ShotChips({
  shot,
  index,
  vocabularies,
  onChange,
}: ShotChipsProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const fields = FIELDS.filter((field) => {
    // The first shot is not cut into, so it has no transition to set.
    if (field.key === "transition" && index === 0) return false
    /*
     * The amplitude and the speed are written into the sentence that says how the camera moves,
     * so without a move they go nowhere. They are offered once there is one, and stay while they
     * hold something of their own so whatever is in them can still be taken out.
     */
    if (field.modifiesTheMove) return shot.cameraMotion !== null || shot[field.key] !== null
    return true
  })
  const unset = fields.filter((field) => shot[field.key] === null)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SecondsChip shot={shot} onChange={onChange} />

      {fields
        .filter((field) => shot[field.key] !== null || showAll)
        .map((field) => (
          <WordChip
            key={field.key}
            field={field}
            shotId={shot.id}
            value={shot[field.key]}
            options={field.options(vocabularies)}
            onChange={(value) => onChange({ [field.key]: value })}
          />
        ))}

      <SoundChip shot={shot} onChange={onChange} />

      {unset.length > 0 && !showAll && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 rounded-full"
          aria-label={`Set more about shot ${index + 1}`}
          onClick={() => setShowAll(true)}
        >
          <Plus className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

/** The look of a chip, whether it holds something or is only offering to. */
function chipClass(set: boolean): string {
  const shared = "rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap hover:bg-accent"
  return set ? `${shared} bg-accent/40` : `${shared} border-dashed text-muted-foreground`
}

interface WordChipProps {
  field: ChipField
  shotId: number
  value: string | null
  options: readonly string[]
  onChange: (value: string | null) => void
}

/** One word of the target's vocabulary, chosen from the list behind its chip. */
function WordChip({ field, shotId, value, options, onChange }: WordChipProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${field.label} of shot ${shotId}`}
          className={chipClass(value !== null)}
        >
          {value === null ? field.label : chipLabel(value)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex max-h-72 w-56 flex-col gap-0.5 overflow-y-auto p-1">
        <button
          type="button"
          className="rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
          onClick={() => {
            onChange(null)
            setOpen(false)
          }}
        >
          Not set
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded px-2 py-1 text-left text-sm hover:bg-accent ${
              option === value ? "bg-accent" : ""
            }`}
            onClick={() => {
              onChange(option)
              setOpen(false)
            }}
          >
            {option}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

interface FieldChipProps {
  shot: ShotComposition
  onChange: (over: Partial<ShotFields>) => void
}

/** How long the shot runs, which every shot has and so always shows. */
function SecondsChip({ shot, onChange }: FieldChipProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [seconds, setSeconds] = useState(String(shot.durationMs / 1000))

  const commit = (): void => {
    // An emptied or nonsense box is not a length, so the shot keeps the one it had.
    const typed = Number(seconds)
    const durationMs = Number.isFinite(typed) ? Math.round(typed * 1000) : 0
    if (durationMs < MIN_SHOT_MS) {
      setSeconds(String(shot.durationMs / 1000))
      return
    }
    onChange({ durationMs })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Length of shot ${shot.id}`} className={chipClass(true)}>
          {shot.durationMs / 1000}s
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-2">
        <Input
          aria-label="Seconds"
          type="number"
          min={0.1}
          step={0.1}
          autoFocus
          value={seconds}
          onChange={(event) => setSeconds(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            commit()
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** What is heard in the shot that nobody says, which is gathered into one field of the prompt. */
function SoundChip({ shot, onChange }: FieldChipProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [soundNote, setSoundNote] = useState(shot.soundNote)
  const written = shot.soundNote.trim().length > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Sound of shot ${shot.id}`}
          className={chipClass(written)}
        >
          {written ? shot.soundNote : "Sound"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2">
        <Input
          aria-label="Sound"
          autoFocus
          value={soundNote}
          onChange={(event) => setSoundNote(event.target.value)}
          onBlur={() => onChange({ soundNote })}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            onChange({ soundNote })
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
