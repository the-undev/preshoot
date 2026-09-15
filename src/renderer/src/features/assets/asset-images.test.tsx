import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AssetImage } from "@renderer/lib/trpc"
import { AssetImages } from "./asset-images"

const images: AssetImage[] = [
  { id: 1, assetId: 5, fileName: "5-aaa.png", mediaType: "image/png", position: 0 },
  { id: 2, assetId: 5, fileName: "5-bbb.jpg", mediaType: "image/jpeg", position: 1 },
]

function renderImages(over: Partial<React.ComponentProps<typeof AssetImages>> = {}): {
  onAdd: ReturnType<typeof vi.fn>
  onRemove: ReturnType<typeof vi.fn>
  onDraft: ReturnType<typeof vi.fn>
} {
  const onAdd = vi.fn()
  const onRemove = vi.fn()
  const onDraft = vi.fn()
  render(
    <AssetImages
      images={images}
      isAdding={false}
      isDrafting={false}
      onAdd={onAdd}
      onRemove={onRemove}
      onDraft={onDraft}
      {...over}
    />
  )
  return { onAdd, onRemove, onDraft }
}

describe("AssetImages", () => {
  it("shows a thumbnail for each picture, read through the asset scheme", () => {
    renderImages()

    expect(screen.getByAltText("Reference picture 1")).toHaveAttribute("src", "asset://1/160")
    expect(screen.getByAltText("Reference picture 2")).toHaveAttribute("src", "asset://2/160")
  })

  it("reports the picture to remove", () => {
    const { onRemove } = renderImages()

    fireEvent.click(screen.getByRole("button", { name: "Remove reference picture 2" }))

    expect(onRemove).toHaveBeenCalledWith(2)
  })

  it("asks for more pictures", () => {
    const { onAdd } = renderImages()

    fireEvent.click(screen.getByRole("button", { name: "Add pictures" }))

    expect(onAdd).toHaveBeenCalled()
  })

  it("will not draft from a thing with no pictures", () => {
    renderImages({ images: [] })

    expect(screen.getByRole("button", { name: "Draft description" })).toBeDisabled()
    expect(
      screen.getByText("None yet. A description can be drafted from them once there are.")
    ).toBeInTheDocument()
  })

  it("says what it is doing while it looks", () => {
    renderImages({ isDrafting: true })

    expect(screen.getByRole("button", { name: "Looking…" })).toBeDisabled()
  })
})
