import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { listedLibrary } from "./fixtures"
import { LibraryBrowser } from "./library-browser"

function renderBrowser(over: Partial<React.ComponentProps<typeof LibraryBrowser>> = {}): {
  onRefresh: ReturnType<typeof vi.fn>
  onOpenSettings: ReturnType<typeof vi.fn>
  onAddToProject: ReturnType<typeof vi.fn>
  onOpenAsClip: ReturnType<typeof vi.fn>
} {
  const onRefresh = vi.fn()
  const onOpenSettings = vi.fn()
  const onAddToProject = vi.fn()
  const onOpenAsClip = vi.fn()
  render(
    <LibraryBrowser
      folder={listedLibrary}
      isWorking={false}
      onRefresh={onRefresh}
      onOpenSettings={onOpenSettings}
      onAddToProject={onAddToProject}
      onOpenAsClip={onOpenAsClip}
      {...over}
    />
  )
  return { onRefresh, onOpenSettings, onAddToProject, onOpenAsClip }
}

describe("LibraryBrowser", () => {
  it("explains the library and links to settings when no folder is set", () => {
    const { onOpenSettings } = renderBrowser({ folder: { state: "unset" } })

    expect(screen.getByText(/No library folder is set/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it("says when the folder named in settings is not there", () => {
    renderBrowser({ folder: { state: "missing", folder: "/gone" } })

    expect(screen.getByText(/The library folder is not there/)).toBeInTheDocument()
    expect(screen.getByText("/gone")).toBeInTheDocument()
  })

  it("shows the kinds across the top and the first kind's entries", () => {
    renderBrowser()

    const kinds = within(screen.getByRole("group", { name: "Kinds" })).getAllByRole("button")
    expect(kinds.map((kind) => kind.textContent)).toEqual(["characters1", "prompts1", "scenes1"])
    expect(kinds[0]).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Daniel" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Rainy Street" })).not.toBeInTheDocument()
  })

  it("shows another kind's entries when it is chosen", () => {
    renderBrowser()

    fireEvent.click(screen.getByRole("button", { name: /^scenes/ }))

    expect(screen.getByRole("button", { name: "Rainy Street" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Daniel" })).not.toBeInTheDocument()
  })

  it("shows an entry's notes, its pictures as a grid and its other files with their types", () => {
    renderBrowser()

    fireEvent.click(screen.getByRole("button", { name: "Daniel" }))

    const entry = screen.getByRole("region", { name: "Daniel" })
    expect(within(entry).getByText(/A man in his late thirties/)).toBeInTheDocument()
    expect(within(entry).getByAltText("daniel-cafe.png")).toHaveAttribute(
      "src",
      `library://file/${encodeURIComponent("characters/Daniel/daniel-cafe.png")}?width=320`
    )
    const rows = within(entry)
      .getAllByRole("listitem")
      .filter((row) => !within(row).queryByRole("img"))
    expect(rows.map((row) => row.textContent)).toEqual([
      "daniel.safetensorsRefMod",
      "sheet.psdOther",
      "voice.wavAudio",
    ])
  })

  it("says when an entry has no notes", () => {
    renderBrowser()

    fireEvent.click(screen.getByRole("button", { name: /^prompts/ }))
    fireEvent.click(screen.getByRole("button", { name: "one-liner" }))

    expect(screen.getByText(/No notes/)).toBeInTheDocument()
  })

  it("asks to use an entry in the project", () => {
    const { onAddToProject } = renderBrowser()

    fireEvent.click(screen.getByRole("button", { name: "Daniel" }))
    fireEvent.click(screen.getByRole("button", { name: "Use in project" }))

    expect(onAddToProject).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/l/characters/Daniel" })
    )
  })

  it("opens a text file as a clip", () => {
    const { onOpenAsClip } = renderBrowser()

    fireEvent.click(screen.getByRole("button", { name: /^prompts/ }))
    fireEvent.click(screen.getByRole("button", { name: "one-liner" }))
    fireEvent.click(screen.getByRole("button", { name: "Open one-liner.txt as a clip" }))

    expect(onOpenAsClip).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "prompts/one-liner.txt" })
    )
  })

  it("offers nothing that changes the folder", () => {
    renderBrowser()

    fireEvent.click(screen.getByRole("button", { name: "Daniel" }))

    for (const name of [/delete/i, /rename/i, /remove/i, /edit/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    }
  })

  it("reads the folder again when asked", () => {
    const { onRefresh } = renderBrowser()

    fireEvent.click(screen.getByRole("button", { name: "Read the library folder again" }))

    expect(onRefresh).toHaveBeenCalled()
  })
})
