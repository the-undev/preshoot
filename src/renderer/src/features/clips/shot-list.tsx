import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { useState } from "react"
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@renderer/design-system"
import type { ShotComposition, SubjectComposition, Vocabularies } from "@renderer/lib/trpc"
import type { ClipMenuContext } from "./line-commands"
import { ShotRow } from "./shot-row"
import type { ShotFields } from "./use-clip"

interface ShotListProps {
  shots: ShotComposition[]
  subjects: SubjectComposition[]
  speakers: SubjectComposition[]
  vocabularies: Vocabularies
  /** The shot just added, which is opened and taken to rather than left folded at the end. */
  showShot: number | null
  menu: ClipMenuContext
  onChange: (shotId: number, fields: ShotFields) => void
  onMove: (shotId: number, toPosition: number) => void
  onRemove: (shotId: number) => void
  onSave: (shotId: number, name: string) => void
}

/** The clip's shots in order, each collapsible, and draggable into another order. */
export function ShotList({
  shots,
  subjects,
  speakers,
  vocabularies,
  showShot,
  menu,
  onChange,
  onMove,
  onRemove,
  onSave,
}: ShotListProps): React.JSX.Element {
  const [removing, setRemoving] = useState<{ id: number; number: number } | null>(null)
  const [saving, setSaving] = useState<{ id: number; number: number } | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function dropped(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const toPosition = shots.findIndex((shot) => shot.id === over.id)
    if (toPosition >= 0) onMove(Number(active.id), toPosition)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={dropped}
    >
      <SortableContext items={shots.map((shot) => shot.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3">
          {shots.map((shot, index) => (
            <ShotRow
              key={shot.id}
              shot={shot}
              index={index}
              subjects={subjects}
              speakers={speakers}
              vocabularies={vocabularies}
              showing={shot.id === showShot}
              menu={menu}
              onChange={(fields) => onChange(shot.id, fields)}
              onRemove={() => setRemoving({ id: shot.id, number: index + 1 })}
              onSave={() => setSaving({ id: shot.id, number: index + 1 })}
            />
          ))}
          {removing && (
            <ConfirmDialog
              title={`Delete shot ${removing.number}?`}
              description="What it shows, what happens in it and anything said in it go with it."
              confirmLabel="Delete"
              onCancel={() => setRemoving(null)}
              onConfirm={() => {
                onRemove(removing.id)
                setRemoving(null)
              }}
            />
          )}
          {saving && (
            <NameShotDialog
              number={saving.number}
              onCancel={() => setSaving(null)}
              onSave={(name) => {
                onSave(saving.id, name)
                setSaving(null)
              }}
            />
          )}
        </div>
      </SortableContext>
    </DndContext>
  )
}

interface NameShotDialogProps {
  number: number
  onSave: (name: string) => void
  onCancel: () => void
}

/** Asks what to call a shot, which is the only place a saved shot is named. */
function NameShotDialog({ number, onSave, onCancel }: NameShotDialogProps): React.JSX.Element {
  const [name, setName] = useState("")
  const trimmed = name.trim()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed.length > 0) onSave(trimmed)
          }}
        >
          <DialogHeader>
            <DialogTitle>Save shot {number} to the library</DialogTitle>
            <DialogDescription>
              A copy goes in the library, with whatever it shows, ready to drop into another clip.
              This one stays where it is.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            <Label htmlFor="saved-shot-name">Name</Label>
            <Input
              id="saved-shot-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed.length === 0}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
