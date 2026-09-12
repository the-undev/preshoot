import { useState } from "react"
import {
  Button,
  ConfirmDialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/design-system"
import type { Asset, SpeakerComposition } from "@renderer/lib/trpc"

/** Stands for a voice that belongs to nobody in the library. */
const NOT_A_SUBJECT = "custom"

/** A voice as the editor sends it back: one of the subjects, or somebody described here. */
export interface SpeakerFields {
  assetId: number | null
  description: string
}

interface ClipSpeakersProps {
  speakers: SpeakerComposition[]
  library: Asset[]
  onAdd: (fields: SpeakerFields) => void
  onUpdate: (speakerId: number, fields: SpeakerFields) => void
  onRemove: (speakerId: number) => void
}

/** The voices of the clip. Their numbers follow their order, so (S1) is always the first. */
export function ClipSpeakers({
  speakers,
  library,
  onAdd,
  onUpdate,
  onRemove,
}: ClipSpeakersProps): React.JSX.Element {
  const [description, setDescription] = useState("")
  const [removing, setRemoving] = useState<SpeakerComposition | null>(null)
  const trimmed = description.trim()

  return (
    <div className="flex flex-col gap-2">
      {speakers.map((speaker) => (
        <SpeakerRow
          key={speaker.id}
          speaker={speaker}
          library={library}
          onUpdate={onUpdate}
          onRemove={setRemoving}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {library.length > 0 && (
          <Select
            value=""
            onValueChange={(value) => onAdd({ assetId: Number(value), description: "" })}
          >
            <SelectTrigger aria-label="Give a subject a voice" className="w-56 min-w-0">
              <SelectValue placeholder="Give a subject a voice" />
            </SelectTrigger>
            <SelectContent>
              {library.map((asset) => (
                <SelectItem key={asset.id} value={String(asset.id)}>
                  {asset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed.length === 0) return
            onAdd({ assetId: null, description: trimmed })
            setDescription("")
          }}
        >
          <Input
            className="min-w-40 flex-1"
            aria-label="Someone not in the library"
            placeholder="Or someone heard and not seen: a low, weathered voice"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={trimmed.length === 0}>
            Add voice
          </Button>
        </form>
      </div>

      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.label}?`}
          description="Everything this voice says goes with it, and the voices after it are renumbered."
          confirmLabel="Delete"
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

interface SpeakerRowProps {
  speaker: SpeakerComposition
  library: Asset[]
  onUpdate: (speakerId: number, fields: SpeakerFields) => void
  onRemove: (speaker: SpeakerComposition) => void
}

function SpeakerRow({ speaker, library, onUpdate, onRemove }: SpeakerRowProps): React.JSX.Element {
  const [description, setDescription] = useState(speaker.description)
  const chosen = library.find((asset) => asset.name === speaker.subjectName)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="w-8 shrink-0 text-sm text-muted-foreground">{speaker.label}</span>

      <Select
        value={chosen ? String(chosen.id) : NOT_A_SUBJECT}
        onValueChange={(value) =>
          onUpdate(speaker.id, {
            assetId: value === NOT_A_SUBJECT ? null : Number(value),
            description: value === NOT_A_SUBJECT ? description : "",
          })
        }
      >
        <SelectTrigger aria-label={`Who ${speaker.label} is`} className="w-48 min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_A_SUBJECT}>Not a subject</SelectItem>
          {library.map((asset) => (
            <SelectItem key={asset.id} value={String(asset.id)}>
              {asset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {speaker.subjectName ? (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {speaker.description}
        </span>
      ) : (
        <Input
          className="min-w-40 flex-1"
          aria-label={`Speaker ${speaker.label}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => onUpdate(speaker.id, { assetId: null, description })}
        />
      )}

      <Button variant="ghost" size="sm" onClick={() => onRemove(speaker)}>
        Remove
      </Button>
    </div>
  )
}
