import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  Button,
  ConfirmDialog,
  FieldHelp,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/design-system"
import type { Asset, AssetKind, SubjectComposition } from "@renderer/lib/trpc"

/** Stands for a subject written here rather than taken from the library. */
const NEW_SUBJECT = "new"

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

interface ClipCastProps {
  cast: SubjectComposition[]
  /** Which subjects speak, so only those are asked how they sound. */
  speaking: number[]
  saved: Asset[]
  onAdd: (fields: SubjectFields) => void
  onUpdate: (subjectId: number, fields: Omit<SubjectFields, "savedId"> & { voice: string }) => void
  onSave: (subjectId: number) => void
  onRemove: (subjectId: number) => void
}

/**
 * The people, places and objects this clip holds. They belong to the clip, so changing one here
 * changes nothing in any other clip, and saving one copies it into the library as a starting point.
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
  const [name, setName] = useState("")
  const [kind, setKind] = useState<AssetKind>("person")
  const [removing, setRemoving] = useState<SubjectComposition | null>(null)
  const trimmed = name.trim()

  return (
    <div className="flex flex-col gap-2">
      {cast.map((subject) => (
        <CastRow
          key={subject.id}
          subject={subject}
          speaks={speaking.includes(subject.id)}
          onUpdate={(fields) => onUpdate(subject.id, fields)}
          onSave={() => onSave(subject.id)}
          onRemove={() => setRemoving(subject)}
        />
      ))}

      <form
        className="flex min-w-0 flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed.length === 0) return
          onAdd({ savedId: null, kind, name: trimmed, description: "" })
          setName("")
        }}
      >
        <Select value={kind} onValueChange={(value) => setKind(value as AssetKind)}>
          <SelectTrigger aria-label="What kind of subject" className="w-28 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_NAMES.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          className="min-w-32 flex-1"
          aria-label="Name a new subject"
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <Button type="submit" variant="ghost" size="icon" className="size-8" aria-label="Add">
          <Plus className="size-4" />
        </Button>

        {saved.length > 0 && (
          <Select
            value={NEW_SUBJECT}
            onValueChange={(value) =>
              onAdd({ savedId: Number(value), kind, name: "", description: "" })
            }
          >
            <SelectTrigger aria-label="Add a saved subject" className="w-48 min-w-0">
              <SelectValue placeholder="From the library" />
            </SelectTrigger>
            <SelectContent>
              {saved.map((subject) => (
                <SelectItem key={subject.id} value={String(subject.id)}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </form>

      {removing && (
        <ConfirmDialog
          title={`Take ${removing.name} out of this clip?`}
          description="The shots and the lines that name them go with it. Anything saved in the library stays."
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

interface CastRowProps {
  subject: SubjectComposition
  speaks: boolean
  onUpdate: (fields: Omit<SubjectFields, "savedId"> & { voice: string }) => void
  onSave: () => void
  onRemove: () => void
}

/** One of the cast: what they are, how they look, and how they sound once they say something. */
function CastRow({ subject, speaks, onUpdate, onSave, onRemove }: CastRowProps): React.JSX.Element {
  const [name, setName] = useState(subject.name)
  const [description, setDescription] = useState(subject.description)
  const [voice, setVoice] = useState(subject.voice ?? "")

  const commit = (over: Partial<Omit<SubjectFields, "savedId"> & { voice: string }>): void => {
    onUpdate({ kind: subject.kind as AssetKind, name, description, voice, ...over })
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Input
        className="w-32 min-w-0"
        aria-label={`Name of ${subject.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => commit({ name })}
      />
      <Input
        className="min-w-40 flex-1"
        aria-label={`How ${subject.name} looks`}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={() => commit({ description })}
      />
      {speaks && (
        <div className="flex min-w-0 items-center gap-1.5">
          <Label htmlFor={`voice-${subject.id}`} className="text-xs font-normal">
            Voice
          </Label>
          <FieldHelp label="the voice">
            How they sound, which the prompt states once to fix it: age, pitch, timbre, pace or
            accent. It falls back to how they look when it is left empty.
          </FieldHelp>
          <Input
            id={`voice-${subject.id}`}
            className="w-40 min-w-0"
            value={voice}
            onChange={(event) => setVoice(event.target.value)}
            onBlur={() => commit({ voice })}
          />
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Save ${subject.name} to the library`}
        onClick={onSave}
      >
        Save
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Remove ${subject.name}`}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
