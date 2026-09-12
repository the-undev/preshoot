import { Button } from "@renderer/design-system"
import type { Asset } from "@renderer/lib/trpc"

interface AssetListProps {
  assets: Asset[]
  onEdit: (asset: Asset) => void
  onRemove: (id: number) => void
}

/** The library, grouped by kind, in the order the project keeps it. */
export function AssetList({ assets, onEdit, onRemove }: AssetListProps): React.JSX.Element {
  if (assets.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing in the library yet.</p>
  }

  const kinds = [...new Set(assets.map((asset) => asset.kind))]

  return (
    <div className="flex flex-col gap-6">
      {kinds.map((kind) => (
        <section key={kind} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {kind}
          </h3>
          <ul className="flex flex-col gap-2">
            {assets
              .filter((asset) => asset.kind === kind)
              .map((asset) => (
                <li key={asset.id} className="flex items-start justify-between gap-4 border-b pb-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{asset.name}</span>
                    <span className="text-xs text-muted-foreground">{asset.description}</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(asset)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onRemove(asset.id)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
