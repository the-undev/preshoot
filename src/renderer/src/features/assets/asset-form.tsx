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
import type { AssetKind } from "@renderer/lib/trpc"
import type { AssetFields } from "./use-assets"

/** What a thing in the library can be. The router accepts these and nothing else. */
const ASSET_KINDS: AssetKind[] = ["person", "place", "object"]

interface AssetFormProps {
  fields: AssetFields
  isExisting: boolean
  isSaving: boolean
  onChange: (fields: AssetFields) => void
  onSubmit: () => void
  onCancel: () => void
  children?: React.ReactNode
}

/**
 * Adds a thing to the library, or rewrites one. Its fields are held by whoever opened it, so a
 * description drafted from the pictures can be put into the box without the form holding two
 * versions of the same text.
 */
export function AssetForm({
  fields,
  isExisting,
  isSaving,
  onChange,
  onSubmit,
  onCancel,
  children,
}: AssetFormProps): React.JSX.Element {
  const ready = fields.name.trim().length > 0 && fields.description.trim().length > 0

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) onSubmit()
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-kind">Kind</Label>
        <Select
          value={fields.kind}
          onValueChange={(value) => onChange({ ...fields, kind: value as AssetKind })}
        >
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
          value={fields.name}
          onChange={(event) => onChange({ ...fields, name: event.target.value })}
          placeholder="Keeper"
        />
      </div>

      {children}

      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-description">Description</Label>
        <Textarea
          id="asset-description"
          rows={6}
          value={fields.description}
          onChange={(event) => onChange({ ...fields, description: event.target.value })}
          placeholder="An elderly man in oilskins, grey stubble, a slow and deliberate walk."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || isSaving}>
          {isExisting ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  )
}
