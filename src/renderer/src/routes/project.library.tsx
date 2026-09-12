import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Alert, AlertDescription, Button } from "@renderer/design-system"
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

  const close = (): void => setEditing({ kind: "none" })

  return (
    <main className="mx-auto grid w-full max-w-[1400px] gap-8 p-8 lg:grid-cols-[1fr_2fr]">
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
          onRemove={library.remove}
        />
      </section>
    </main>
  )
}
