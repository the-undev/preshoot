import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  Button,
  ConfirmDialog,
  FieldHelp,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@renderer/design-system"
import type { Asset, AssetKind, SubjectComposition } from "@renderer/lib/trpc"

/** What each kind is called on screen. */
const KIND_NAMES: { id: AssetKind; name: string }[] = [
  { id: "person", name: "Person" },
  { id: "place", name: "Place" },
  { id: "object", name: "Object" },
]

/** A subject as the editor sends it back, either written here or copied from the library. */
export interface SubjectFields {
  savedId: number | null
  kind: AssetKind
  name: string
  description: string
}

/** One of the cast as the editor sends it back, which always says how they sound. */
export type SubjectEdit = Omit<SubjectFields, "savedId"> & { voice: string }

/** The look of a chip, whether it holds a subject or is offering to make one. */
function chipClass(set: boolean): string {
  const shared = "rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap hover:bg-accent"
  return set ? `${shared} bg-accent/40` : `${shared} border-dashed text-muted-foreground`
}

interface ClipCastProps {
  cast: SubjectComposition[]
  /** Which subjects speak, so only those are asked how they sound. */
  speaking: number[]
  saved: Asset[]
  onAdd: (fields: SubjectFields) => void
  onUpdate: (subjectId: number, fields: SubjectEdit) => void
  onSave: (subjectId: number) => void
  onRemove: (subjectId: number) => void
}

/**
 * The people, places and objects this clip holds, as a strip of chips. They belong to the clip, so
 * changing one here changes nothing in any other clip, and saving one copies it into the library
 * as a starting point.
 */
export function ClipCast({
  cast,
  speaking,
  saved,
  onAdd,
  onUpdate,
  onSave,
  onRemove,
}: ClipCastProps): React.JSX.Element {
  const [removing, setRemoving] = useState<SubjectComposition | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {cast.map((subject) => (
        <CastChip
          key={subject.id}
          subject={subject}
          speaks={speaking.includes(subject.id)}
          onUpdate={(fields) => onUpdate(subject.id, fields)}
          onSave={() => onSave(subject.id)}
          onRemove={() => setRemoving(subject)}
        />
      ))}

      <AddCastChip saved={saved} onAdd={onAdd} />

      {removing && (
        <ConfirmDialog
          title={`Take ${removing.name} out of this clip?`}
          description="The lines that name them go with it. Anything saved in the library stays."
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onRemove(removing.id)
            setRemoving(null)
          }}
        />
      )}
    </div>
  )
}

interface CastChipProps {
  subject: SubjectComposition
  speaks: boolean
  onUpdate: (fields: SubjectEdit) => void
  onSave: () => void
  onRemove: () => void
}

/** One of the cast: what they are, how they look, and how they sound once they say something. */
function CastChip({
  subject,
  speaks,
  onUpdate,
  onSave,
  onRemove,
}: CastChipProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(subject.name)
  const [description, setDescription] = useState(subject.description)
  const [voice, setVoice] = useState(subject.voice ?? "")

  const commit = (over: Partial<SubjectEdit>): void => {
    onUpdate({ kind: subject.kind as AssetKind, name, description, voice, ...over })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Edit ${subject.name}`} className={chipClass(true)}>
          {subject.name}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`cast-${subject.id}-name`}>Name</Label>
          <Input
            id={`cast-${subject.id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => commit({ name })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`cast-${subject.id}-description`}>How they look</Label>
            <FieldHelp label="how they look">
              Said once, beside their name, the first time the clip names them. Write it as it would
              read after the name: `an elderly man in oilskins`.
            </FieldHelp>
          </div>
          <Input
            id={`cast-${subject.id}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => commit({ description })}
          />
        </div>

        {speaks && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={`cast-${subject.id}-voice`}>Voice</Label>
              <FieldHelp label="the voice">
                How they sound, which the prompt states once to fix it: age, pitch, timbre, pace or
                accent. It falls back to how they look when it is left empty.
              </FieldHelp>
            </div>
            <Input
              id={`cast-${subject.id}-voice`}
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              onBlur={() => commit({ voice })}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Save ${subject.name} to the library`}
            onClick={onSave}
          >
            Save to the library
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Remove ${subject.name}`}
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface AddCastChipProps {
  saved: Asset[]
  onAdd: (fields: SubjectFields) => void
}

/** Adds a subject to the clip, either written here or copied from the library. */
function AddCastChip({ saved, onAdd }: AddCastChipProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<AssetKind>("person")
  const [name, setName] = useState("")
  const trimmed = name.trim()

  const add = (): void => {
    if (trimmed.length === 0) return
    onAdd({ savedId: null, kind, name: trimmed, description: "" })
    setName("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 rounded-full"
          aria-label="Add a subject"
        >
          <Plus className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-3">
        <div className="flex gap-1">
          {KIND_NAMES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={kind === entry.id}
              className={chipClass(kind === entry.id)}
              onClick={() => setKind(entry.id)}
            >
              {entry.name}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <Input
            autoFocus
            aria-label="Name a new subject"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={trimmed.length === 0}>
            Add
          </Button>
        </form>

        {saved.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">From the library</span>
            <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {saved.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  className="rounded px-2 py-1 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onAdd({ savedId: subject.id, kind, name: "", description: "" })
                    setOpen(false)
                  }}
                >
                  {subject.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
