import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Alert, AlertDescription, Button, ConfirmDialog } from "@renderer/design-system"
import { AssetForm } from "@renderer/features/assets/asset-form"
import { AssetImages } from "@renderer/features/assets/asset-images"
import { AssetList } from "@renderer/features/assets/asset-list"
import { useAssetImages } from "@renderer/features/assets/use-asset-images"
import { useAssets, type AssetFields } from "@renderer/features/assets/use-assets"
import type { Asset } from "@renderer/lib/trpc"

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

  // A drafted description goes into the box, where it can be read and changed before it is saved.
  const shown = pictures.drafted ? { ...fields, description: pictures.drafted } : fields

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
            fields={shown}
            isExisting={editing.kind === "existing"}
            isSaving={library.isSaving}
            onChange={(next) => {
              pictures.forget()
              setFields(next)
            }}
            onCancel={close}
            onSubmit={() => {
              if (editing.kind === "existing") {
                library.update(editing.asset.id, shown)
              } else {
                library.create(shown)
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
          </AssetForm>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <AssetList
          assets={library.assets}
          images={pictures.images}
          onEdit={(asset) => open({ kind: "existing", asset })}
          onRemove={(id) => setRemoving(library.assets.find((asset) => asset.id === id) ?? null)}
        />
      </section>

      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          description="Its reference pictures go with it, and a shot that still shows it will refuse to let it go."
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
