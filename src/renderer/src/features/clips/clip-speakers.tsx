import { useState } from "react"
import { Button, Input } from "@renderer/design-system"
import type { SpeakerComposition } from "@renderer/lib/trpc"

interface ClipSpeakersProps {
  speakers: SpeakerComposition[]
  onAdd: (description: string) => void
  onUpdate: (speakerId: number, description: string) => void
  onRemove: (speakerId: number) => void
}

/** The voices of the clip. Their numbers follow their order, so (S1) is always the first. */
export function ClipSpeakers({
  speakers,
  onAdd,
  onUpdate,
  onRemove,
}: ClipSpeakersProps): React.JSX.Element {
  const [description, setDescription] = useState("")
  const trimmed = description.trim()

  return (
    <div className="flex flex-col gap-2">
      {speakers.map((speaker) => (
        <SpeakerRow key={speaker.id} speaker={speaker} onUpdate={onUpdate} onRemove={onRemove} />
      ))}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed.length === 0) return
          onAdd(trimmed)
          setDescription("")
        }}
      >
        <Input
          aria-label="New speaker"
          placeholder="An elderly keeper, low and weathered, slow"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={trimmed.length === 0}>
          Add speaker
        </Button>
      </form>
    </div>
  )
}

interface SpeakerRowProps {
  speaker: SpeakerComposition
  onUpdate: (speakerId: number, description: string) => void
  onRemove: (speakerId: number) => void
}

function SpeakerRow({ speaker, onUpdate, onRemove }: SpeakerRowProps): React.JSX.Element {
  const [description, setDescription] = useState(speaker.description)

  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-sm text-muted-foreground">{speaker.label}</span>
      <Input
        aria-label={`Speaker ${speaker.label}`}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={() => onUpdate(speaker.id, description)}
      />
      <Button variant="ghost" size="sm" onClick={() => onRemove(speaker.id)}>
        Remove
      </Button>
    </div>
  )
}
