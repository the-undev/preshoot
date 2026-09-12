import { useState } from "react"
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@renderer/design-system"
import type { Asset, AssetKind } from "@renderer/lib/trpc"
import type { AssetFields } from "./use-assets"

/** What a thing in the library can be. The router accepts these and nothing else. */
const ASSET_KINDS: AssetKind[] = ["person", "place", "object"]

interface AssetFormProps {
  asset: Asset | null
  onSubmit: (fields: AssetFields) => void
  onCancel: () => void
  isSaving: boolean
}

/** Adds a thing to the library, or rewrites one. */
export function AssetForm({
  asset,
  onSubmit,
  onCancel,
  isSaving,
}: AssetFormProps): React.JSX.Element {
  const [kind, setKind] = useState<AssetKind>((asset?.kind as AssetKind) ?? "person")
  const [name, setName] = useState(asset?.name ?? "")
  const [description, setDescription] = useState(asset?.description ?? "")

  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  const ready = trimmedName.length > 0 && trimmedDescription.length > 0

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) onSubmit({ kind, name: trimmedName, description: trimmedDescription })
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-kind">Kind</Label>
        <Select value={kind} onValueChange={(value) => setKind(value as AssetKind)}>
          <SelectTrigger id="asset-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSET_KINDS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-name">Name</Label>
        <Input
          id="asset-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Keeper"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-description">Description</Label>
        <Textarea
          id="asset-description"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="An elderly man in oilskins, grey stubble, a slow and deliberate walk."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || isSaving}>
          {asset ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  )
}
