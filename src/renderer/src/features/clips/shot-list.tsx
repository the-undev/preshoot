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
import { ConfirmDialog } from "@renderer/design-system"
import type { Asset, ShotComposition, SpeakerComposition, Vocabularies } from "@renderer/lib/trpc"
import { ShotRow } from "./shot-row"
import type { ShotFields } from "./use-clip"

interface ShotListProps {
  shots: ShotComposition[]
  speakers: SpeakerComposition[]
  library: Asset[]
  vocabularies: Vocabularies
  onChange: (shotId: number, fields: ShotFields) => void
  onMove: (shotId: number, toPosition: number) => void
  onRemove: (shotId: number) => void
  onAddPeople: () => void
}

/** The clip's shots in order, each collapsible, and draggable into another order. */
export function ShotList({
  shots,
  speakers,
  library,
  vocabularies,
  onChange,
  onMove,
  onRemove,
  onAddPeople,
}: ShotListProps): React.JSX.Element {
  const [removing, setRemoving] = useState<{ id: number; number: number } | null>(null)
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
              speakers={speakers}
              library={library}
              vocabularies={vocabularies}
              onChange={(fields) => onChange(shot.id, fields)}
              onRemove={() => setRemoving({ id: shot.id, number: index + 1 })}
              onAddPeople={onAddPeople}
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
        </div>
      </SortableContext>
    </DndContext>
  )
}
