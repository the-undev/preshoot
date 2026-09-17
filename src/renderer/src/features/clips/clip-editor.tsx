import { Plus } from "lucide-react"
import { Button, FieldHelp } from "@renderer/design-system"
import type { Asset, ClipComposition, SavedShot, Vocabularies } from "@renderer/lib/trpc"
import type { SubjectEdit } from "./use-clip"
import { clipReadiness } from "./readiness"
import { ClipCast, type SubjectFields } from "./clip-cast"
import { ShotList } from "./shot-list"
import type { ShotFields } from "./use-clip"

/** How long a clip may run before the target model stops being able to hold it. */
const MAX_CLIP_SECONDS = 15

interface ClipEditorProps {
  composition: ClipComposition
  vocabularies: Vocabularies
  isSaving: boolean
  /** The shot just added, which the list opens and takes the user to. */
  showShot: number | null
  onAddShot: () => void
  onShotChange: (shotId: number, fields: ShotFields) => void
  onMoveShot: (shotId: number, toPosition: number) => void
  onMoveLine: (input: { shotId: number; at: number; toShotId: number; toPosition: number }) => void
  onRemoveShot: (shotId: number) => void
  onSaveShot: (shotId: number, name: string) => void
  savedShots: SavedShot[]
  onAddSavedShot: (savedShotId: number) => void
  saved: Asset[]
  speaking: number[]
  onAddSubject: (fields: SubjectFields) => void
  onUpdateSubject: (subjectId: number, fields: SubjectEdit) => void
  onSaveSubject: (subjectId: number) => void
  onRemoveSubject: (subjectId: number) => void
}

/** The voices and the shots of a clip, which is what a clip is worked on through. */
export function ClipEditor({
  composition,
  vocabularies,
  isSaving,
  showShot,
  onAddShot,
  onShotChange,
  onMoveShot,
  onMoveLine,
  onRemoveShot,
  onSaveShot,
  savedShots,
  onAddSavedShot,
  saved,
  speaking,
  onAddSubject,
  onUpdateSubject,
  onSaveSubject,
  onRemoveSubject,
}: ClipEditorProps): React.JSX.Element {
  const seconds = composition.shots.reduce((total, shot) => total + shot.durationMs, 0) / 1000
  const tooLong = seconds > MAX_CLIP_SECONDS
  const missing = clipReadiness(composition)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">Cast</h2>
          <FieldHelp label="the cast">
            The people, places and objects this clip refers to. They belong to this clip, so
            changing one here changes nothing in any other, and saving one puts a copy in the
            library to start from.
          </FieldHelp>
        </div>
        <ClipCast
          cast={composition.cast}
          speaking={speaking}
          saved={saved}
          onAdd={onAddSubject}
          onUpdate={onUpdateSubject}
          onSave={onSaveSubject}
          onRemove={onRemoveSubject}
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
          subjects={composition.cast}
          speakers={composition.cast.filter((subject) => subject.kind === "person")}
          vocabularies={vocabularies}
          showShot={showShot}
          menu={{
            vocabularies,
            savedShots,
            onAddSavedShot,
            savedSubjects: saved,
            onAddSavedSubject: (savedId) =>
              onAddSubject({ savedId, kind: "person", name: "", description: "" }),
            onAddSubject: (name) =>
              onAddSubject({ savedId: null, kind: "person", name, description: "" }),
            onNewShot: onAddShot,
          }}
          onChange={onShotChange}
          onMove={onMoveShot}
          onMoveLine={(from, to) => onMoveLine({ ...from, ...to })}
          onRemove={onRemoveShot}
          onSave={onSaveShot}
        />

        <div className="flex flex-wrap items-center gap-2">
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
