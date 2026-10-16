import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Asset } from "@renderer/lib/trpc"
import { AssetList } from "./asset-list"

const assets: Asset[] = [
  {
    id: 1,
    clipId: null,
    kind: "object",
    name: "Lamp",
    description: "brass and glass",
    voice: null,
    createdAt: "2026-09-12T08:00:00.000Z",
  },
  {
    id: 2,
    clipId: null,
    kind: "person",
    name: "Keeper",
    description: "an elderly man in oilskins",
    voice: null,
    createdAt: "2026-09-12T08:00:00.000Z",
  },
  {
    id: 3,
    clipId: null,
    kind: "person",
    name: "Operator",
    description: "a young radio operator",
    voice: null,
    createdAt: "2026-09-12T08:00:00.000Z",
  },
]

describe("AssetList", () => {
  it("shows each thing under its kind", () => {
    render(
      <AssetList
        assets={assets}
        images={[]}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onCopyToLibrary={vi.fn()}
      />
    )

    expect(screen.getByText("object")).toBeInTheDocument()
    expect(screen.getByText("person")).toBeInTheDocument()
    expect(screen.getByText("Keeper")).toBeInTheDocument()
    expect(screen.getByText("an elderly man in oilskins")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  it("reports the thing that was chosen for rewriting", () => {
    const onEdit = vi.fn()
    render(
      <AssetList
        assets={assets}
        images={[]}
        onEdit={onEdit}
        onRemove={vi.fn()}
        onCopyToLibrary={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0])

    expect(onEdit).toHaveBeenCalledWith(assets[0])
  })

  it("reports the thing that was deleted", () => {
    const onRemove = vi.fn()
    render(
      <AssetList
        assets={assets}
        images={[]}
        onEdit={vi.fn()}
        onRemove={onRemove}
        onCopyToLibrary={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1])

    expect(onRemove).toHaveBeenCalledWith(2)
  })

  it("says so when nothing is saved", () => {
    render(
      <AssetList
        assets={[]}
        images={[]}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onCopyToLibrary={vi.fn()}
      />
    )

    expect(screen.getByText("Nothing saved yet.")).toBeInTheDocument()
  })

  it("reports the thing to copy out to the library", () => {
    const onCopyToLibrary = vi.fn()
    render(
      <AssetList
        assets={assets}
        images={[]}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onCopyToLibrary={onCopyToLibrary}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Copy Keeper to the library" }))

    expect(onCopyToLibrary).toHaveBeenCalledWith(assets[1])
  })
})
