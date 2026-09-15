import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { Alert, AlertDescription, Button, ConfirmDialog } from "@renderer/design-system"
import { AssetForm } from "@renderer/features/assets/asset-form"
import { AssetImages } from "@renderer/features/assets/asset-images"
import { AssetList } from "@renderer/features/assets/asset-list"
import { useAssetImages } from "@renderer/features/assets/use-asset-images"
import { useAssets, type AssetFields } from "@renderer/features/assets/use-assets"
import { useTRPC, type Asset } from "@renderer/lib/trpc"

export const Route = createFileRoute("/project/library")({
  component: Library,
})

/** Which thing the form is for: none, a new one, or one already in the library. */
type Editing = { kind: "none" } | { kind: "new" } | { kind: "existing"; asset: Asset }

const EMPTY: AssetFields = { kind: "person", name: "", description: "", voice: null }

function Library(): React.JSX.Element {
  const library = useAssets()
  const pictures = useAssetImages()
  const [editing, setEditing] = useState<Editing>({ kind: "none" })
  const [fields, setFields] = useState<AssetFields>(EMPTY)
  const [removing, setRemoving] = useState<Asset | null>(null)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const shots = useQuery(trpc.clips.savedShots.queryOptions())
  const savedShots = shots.data ?? []
  const removeSavedShot = useMutation(
    trpc.clips.removeSavedShot.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.clips.savedShots.queryKey() })
      },
    })
  )

  function open(next: Editing): void {
    setEditing(next)
    setFields(
      next.kind === "existing"
        ? {
            kind: next.asset.kind as AssetFields["kind"],
            name: next.asset.name,
            description: next.asset.description,
            voice: next.asset.voice,
          }
        : EMPTY
    )
    pictures.forget()
  }

  function close(): void {
    open({ kind: "none" })
  }

  // A draft is offered beside what is there rather than dropped into the box, so neither is lost.
  const drafted = pictures.drafted

  return (
    <main className="mx-auto grid h-full w-full max-w-[1400px] gap-8 overflow-y-auto p-8 lg:grid-cols-[1fr_2fr]">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">
            People, places and objects
          </h2>
          <Button size="sm" onClick={() => open({ kind: "new" })}>
            Add
          </Button>
        </div>

        {(library.errorMessage ?? pictures.errorMessage) && (
          <Alert variant="destructive">
            <AlertDescription>{library.errorMessage ?? pictures.errorMessage}</AlertDescription>
          </Alert>
        )}

        {editing.kind !== "none" && (
          <AssetForm
            fields={fields}
            isExisting={editing.kind === "existing"}
            isSaving={library.isSaving}
            onChange={(next) => {
              pictures.forget()
              setFields(next)
            }}
            onCancel={close}
            onSubmit={() => {
              if (editing.kind === "existing") {
                library.update(editing.asset.id, fields)
              } else {
                library.create(fields)
              }
              close()
            }}
          >
            {editing.kind === "existing" && (
              <AssetImages
                images={pictures.imagesOf(editing.asset.id)}
                isAdding={pictures.isAdding}
                isDrafting={pictures.isDrafting}
                onAdd={() => pictures.add(editing.asset.id)}
                onRemove={pictures.remove}
                onDraft={() => pictures.draft(editing.asset.id)}
              />
            )}

            {drafted && (
              <div className="flex flex-col gap-2 rounded border p-3">
                <p className="text-xs text-muted-foreground">
                  The model wrote this from the pictures. It is not saved until you take it.
                </p>
                <p className="text-sm">{drafted}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setFields({ ...fields, description: drafted })
                      pictures.forget()
                    }}
                  >
                    Use it
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const already = fields.description.trim()
                      setFields({
                        ...fields,
                        description: already.length > 0 ? `${already} ${drafted}` : drafted,
                      })
                      pictures.forget()
                    }}
                  >
                    Add it to what is there
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={pictures.forget}>
                    Discard
                  </Button>
                </div>
              </div>
            )}
          </AssetForm>
        )}
      </section>

      <section className="flex min-h-0 flex-col gap-6 overflow-y-auto">
        <AssetList
          assets={library.assets}
          images={pictures.images}
          onEdit={(asset) => open({ kind: "existing", asset })}
          onRemove={(id) => setRemoving(library.assets.find((asset) => asset.id === id) ?? null)}
        />

        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">Saved shots</h2>
          {savedShots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing saved yet. Save a shot from a clip and it can be dropped into any other.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {savedShots.map((shot) => (
                <li
                  key={shot.id}
                  className="flex items-center gap-2 border-b py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{shot.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {(shot.durationMs / 1000).toFixed(1)}s
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Delete ${shot.name}`}
                    onClick={() => removeSavedShot.mutate({ shotId: shot.id })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          description="Its reference pictures go with it. Copies of it already in a clip stay where they are."
          confirmLabel="Delete"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            library.remove(removing.id)
            setRemoving(null)
          }}
        />
      )}
    </main>
  )
}
