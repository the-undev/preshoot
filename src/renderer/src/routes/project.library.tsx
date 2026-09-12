import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Alert, AlertDescription, Button, ConfirmDialog } from "@renderer/design-system"
import { AssetForm } from "@renderer/features/assets/asset-form"
import { AssetList } from "@renderer/features/assets/asset-list"
import { useAssets } from "@renderer/features/assets/use-assets"
import type { Asset } from "@renderer/lib/trpc"

export const Route = createFileRoute("/project/library")({
  component: Library,
})

/** Which thing the form is for: none, a new one, or one already in the library. */
type Editing = { kind: "none" } | { kind: "new" } | { kind: "existing"; asset: Asset }

function Library(): React.JSX.Element {
  const library = useAssets()
  const [editing, setEditing] = useState<Editing>({ kind: "none" })
  const [removing, setRemoving] = useState<Asset | null>(null)

  const close = (): void => setEditing({ kind: "none" })

  return (
    <main className="mx-auto grid h-full w-full max-w-[1400px] gap-8 overflow-y-auto p-8 lg:grid-cols-[1fr_2fr]">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">
            People, places and objects
          </h2>
          <Button size="sm" onClick={() => setEditing({ kind: "new" })}>
            Add
          </Button>
        </div>

        {library.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{library.errorMessage}</AlertDescription>
          </Alert>
        )}

        {editing.kind !== "none" && (
          <AssetForm
            key={editing.kind === "existing" ? editing.asset.id : "new"}
            asset={editing.kind === "existing" ? editing.asset : null}
            isSaving={library.isSaving}
            onCancel={close}
            onSubmit={(fields) => {
              if (editing.kind === "existing") {
                library.update(editing.asset.id, fields)
              } else {
                library.create(fields)
              }
              close()
            }}
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <AssetList
          assets={library.assets}
          onEdit={(asset) => setEditing({ kind: "existing", asset })}
          onRemove={(id) => setRemoving(library.assets.find((asset) => asset.id === id) ?? null)}
        />
      </section>

      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          description="A shot that still shows it will refuse to let it go."
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
