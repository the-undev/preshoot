import { Plus } from "lucide-react"
import { Button } from "@renderer/design-system"
import type { Asset, ClipComposition, Vocabularies } from "@renderer/lib/trpc"
import { clipReadiness } from "./readiness"
import { ClipSpeakers, type SpeakerFields } from "./clip-speakers"
import { ShotList } from "./shot-list"
import type { ShotFields } from "./use-clip"

/** How long a clip may run before the target model stops being able to hold it. */
const MAX_CLIP_SECONDS = 15

interface ClipEditorProps {
  composition: ClipComposition
  vocabularies: Vocabularies
  library: Asset[]
  isSaving: boolean
  onAddShot: () => void
  onShotChange: (shotId: number, fields: ShotFields) => void
  onMoveShot: (shotId: number, toPosition: number) => void
  onRemoveShot: (shotId: number) => void
  onAddSpeaker: (fields: SpeakerFields) => void
  onUpdateSpeaker: (speakerId: number, fields: SpeakerFields) => void
  onRemoveSpeaker: (speakerId: number) => void
  onAddPeople: () => void
}

/** The voices and the shots of a clip, which is what a clip is worked on through. */
export function ClipEditor({
  composition,
  vocabularies,
  library,
  isSaving,
  onAddShot,
  onShotChange,
  onMoveShot,
  onRemoveShot,
  onAddSpeaker,
  onUpdateSpeaker,
  onRemoveSpeaker,
  onAddPeople,
}: ClipEditorProps): React.JSX.Element {
  const seconds = composition.shots.reduce((total, shot) => total + shot.durationMs, 0) / 1000
  const tooLong = seconds > MAX_CLIP_SECONDS
  const missing = clipReadiness(composition)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Speakers</h2>
        <p className="text-xs text-muted-foreground">
          Anyone who speaks or sings. Each becomes a voice the prompt refers to as (S1), (S2) and so
          on, described once so it stays the same across shots.
        </p>
        <ClipSpeakers
          speakers={composition.speakers}
          library={library}
          onAdd={onAddSpeaker}
          onUpdate={onUpdateSpeaker}
          onRemove={onRemoveSpeaker}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">Shots</h2>
          <p className={tooLong ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {tooLong
              ? `${seconds.toFixed(1)}s, longer than the ${MAX_CLIP_SECONDS}s a clip can run`
              : `${seconds.toFixed(1)}s of ${MAX_CLIP_SECONDS}s`}
          </p>
        </div>

        <ShotList
          shots={composition.shots}
          speakers={composition.speakers}
          library={library}
          vocabularies={vocabularies}
          onChange={onShotChange}
          onMove={onMoveShot}
          onRemove={onRemoveShot}
          onAddPeople={onAddPeople}
        />

        <div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Add a shot"
            title="Add a shot (Ctrl Shift N)"
            disabled={isSaving}
            onClick={onAddShot}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </section>

      {missing.length > 0 && (
        <ul className="flex flex-col gap-1">
          {missing.map((reason) => (
            <li key={reason} className="text-xs text-destructive">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
