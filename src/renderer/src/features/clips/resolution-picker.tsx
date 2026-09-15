import { useState } from "react"
import { Button, Input, Label } from "@renderer/design-system"
import type { AspectRatio } from "@renderer/lib/trpc"
import {
  orientationOf,
  pixelSize,
  shapesFacing,
  SHORT_EDGES,
  turned,
  type Orientation,
} from "./resolution"

/** How wide the largest drawn shape is, in pixels. The rest are drawn in proportion to it. */
const SWATCH = 44

interface ResolutionPickerProps {
  shapes: AspectRatio[]
  aspectRatio: string
  shortEdge: number
  onChange: (fields: { aspectRatio: string; shortEdge: number }) => void
}

/**
 * The shape and the size a clip generates at, which the request carries as an aspect ratio and a
 * short edge. Turning the clip picks the same ratio the other way round, so one set of controls
 * reads either as a resolution and an orientation or as a ratio and a short edge.
 */
export function ResolutionPicker({
  shapes,
  aspectRatio,
  shortEdge,
  onChange,
}: ResolutionPickerProps): React.JSX.Element {
  const [typedEdge, setTypedEdge] = useState(String(shortEdge))
  const chosen = shapes.find((shape) => shape.value === aspectRatio) ?? shapes[0]

  if (!chosen) {
    return <p className="text-sm text-muted-foreground">Loading the shapes…</p>
  }

  const facing = orientationOf(chosen)
  const size = pixelSize(shortEdge, chosen)

  const face = (to: Orientation): void => {
    if (to === facing) return
    onChange({ aspectRatio: turned(shapes, chosen).value, shortEdge })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["landscape", "portrait"] as const).map((to) => (
          <Button
            key={to}
            type="button"
            size="sm"
            variant={facing === to ? "secondary" : "ghost"}
            aria-pressed={facing === to}
            onClick={() => face(to)}
          >
            {to === "landscape" ? "Landscape" : "Portrait"}
          </Button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Aspect ratio" className="flex flex-wrap items-end gap-2">
        {shapesFacing(shapes, facing).map((shape) => {
          const picked = shape.value === chosen.value
          const long = Math.max(shape.width, shape.height)
          const width = (shape.width / long) * SWATCH
          const height = (shape.height / long) * SWATCH
          return (
            <button
              key={shape.value}
              type="button"
              role="radio"
              aria-checked={picked}
              aria-label={`${shape.value} ${shape.name}`}
              title={shape.name}
              className={`flex w-20 flex-col items-center gap-1 rounded border p-2 ${
                picked ? "border-primary bg-accent" : "border-transparent hover:bg-accent/50"
              }`}
              onClick={() => onChange({ aspectRatio: shape.value, shortEdge })}
            >
              <span className="flex h-11 items-center">
                <span
                  className={`rounded-xs border-2 ${picked ? "border-primary" : "border-muted-foreground"}`}
                  style={{ width, height }}
                />
              </span>
              <span className="text-xs">{shape.value}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Short edge</span>
          <div className="flex flex-wrap items-center gap-1">
            {SHORT_EDGES.map((edge) => (
              <Button
                key={edge}
                type="button"
                size="sm"
                variant={edge === shortEdge ? "secondary" : "ghost"}
                aria-pressed={edge === shortEdge}
                onClick={() => {
                  setTypedEdge(String(edge))
                  onChange({ aspectRatio: chosen.value, shortEdge: edge })
                }}
              >
                {edge}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="clip-short-edge">Or</Label>
          <Input
            id="clip-short-edge"
            className="w-24"
            type="number"
            value={typedEdge}
            onChange={(event) => setTypedEdge(event.target.value)}
            onBlur={() => {
              const typed = Number(typedEdge)
              if (!Number.isFinite(typed) || typed < 128 || typed > 4096) {
                setTypedEdge(String(shortEdge))
                return
              }
              onChange({ aspectRatio: chosen.value, shortEdge: Math.round(typed) })
            }}
          />
        </div>

        <p className="pb-2 font-mono text-sm">
          {size.width} × {size.height}
        </p>
      </div>
    </div>
  )
}
