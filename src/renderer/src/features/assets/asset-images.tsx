import { Button } from "@renderer/design-system"
import { assetImageUrl, type AssetImage } from "@renderer/lib/trpc"

interface AssetImagesProps {
  images: AssetImage[]
  isAdding: boolean
  isDrafting: boolean
  onAdd: () => void
  onRemove: (imageId: number) => void
  onDraft: () => void
}

/** The reference pictures of one library thing, and the button that describes them. */
export function AssetImages({
  images,
  isAdding,
  isDrafting,
  onAdd,
  onRemove,
  onDraft,
}: AssetImagesProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Reference pictures</span>

      {images.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          None yet. A description can be drafted from them once there are.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image.id} className="relative">
              <img
                src={assetImageUrl(image.id)}
                alt={`Reference picture ${index + 1}`}
                className="size-24 rounded border object-cover"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-1 right-1 h-6 px-2 text-xs"
                aria-label={`Remove reference picture ${index + 1}`}
                onClick={() => onRemove(image.id)}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={isAdding} onClick={onAdd}>
          Add pictures
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={images.length === 0 || isDrafting}
          onClick={onDraft}
        >
          {isDrafting ? "Looking…" : "Draft description"}
        </Button>
      </div>
    </div>
  )
}
