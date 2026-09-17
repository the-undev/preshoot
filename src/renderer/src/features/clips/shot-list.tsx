import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
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
import { landingOf, lineAt, shotId as shotDragId, shotOf } from "./line-drag"
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
  onMoveLine: (
    from: { shotId: number; at: number },
    to: {
      toShotId: number
      toPosition: number
    }
  ) => void
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
  onMoveLine,
}: ShotListProps): React.JSX.Element {
  const [removing, setRemoving] = useState<{ id: number; number: number } | null>(null)
  const [saving, setSaving] = useState<{ id: number; number: number } | null>(null)
  // What is being dragged, so it can be drawn under the pointer while its own place stays put.
  const [dragging, setDragging] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  /**
   * One context holds the shots and every line in them, so a line can be taken from one shot and
   * dropped into another. What is being dragged says which it is.
   */
  function dropped(event: DragEndEvent): void {
    const { active, over } = event
    setDragging(null)
    if (!over || active.id === over.id) return
    const from = lineAt(String(active.id))

    if (from) {
      const landing = landingOf(String(over.id), from, shots)
      if (landing) onMoveLine(from, landing)
      return
    }

    const movedShot = shotOf(String(active.id))
    const ontoShot = shotOf(String(over.id))
    if (movedShot === null || ontoShot === null) return
    const toPosition = shots.findIndex((shot) => shot.id === ontoShot)
    if (toPosition >= 0) onMove(movedShot, toPosition)
  }

  return (
    <DndContext
      sensors={sensors}
      // Corners rather than centres: a line is much shorter than the shot it may be dropped into.
      collisionDetection={closestCorners}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={(event: DragStartEvent) => setDragging(String(event.active.id))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={dropped}
    >
      <SortableContext
        items={shots.map((shot) => shotDragId(shot.id))}
        strategy={verticalListSortingStrategy}
      >
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
          <DragOverlay dropAnimation={null}>
            {dragging === null ? null : (
              <div className="rounded border bg-popover px-3 py-1.5 text-sm shadow-lg">
                {draggedName(dragging, shots)}
              </div>
            )}
          </DragOverlay>

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

/** What to draw under the pointer for whatever is being dragged. */
function draggedName(id: string, shots: ShotComposition[]): string {
  const line = lineAt(id)
  if (line) {
    const text = shots.find((shot) => shot.id === line.shotId)?.lines[line.at]?.text.trim()
    return text && text.length > 0 ? text : "An empty line"
  }
  const shot = shotOf(id)
  const at = shots.findIndex((one) => one.id === shot)
  return at === -1 ? "" : `Shot ${at + 1}`
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
