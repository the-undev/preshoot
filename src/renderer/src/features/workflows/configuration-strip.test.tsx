import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Configuration } from "@renderer/lib/trpc"
import { ConfigurationStrip } from "./configuration-strip"

function configuration(over: Partial<Configuration>): Configuration {
  return {
    id: 1,
    workflowId: 3,
    name: "Anna",
    staleSlotNames: [],
    createdAt: "2026-10-16T09:00:00.000Z",
    updatedAt: "2026-10-16T12:30:00.000Z",
    ...over,
  }
}

const configurations: Configuration[] = [
  configuration({}),
  configuration({ id: 2, name: "Bea", staleSlotNames: ["Turbo steps", "Voice"] }),
]

function renderStrip(over: Partial<Parameters<typeof ConfigurationStrip>[0]> = {}): {
  onLoad: ReturnType<typeof vi.fn>
  onRename: ReturnType<typeof vi.fn>
  onDuplicate: ReturnType<typeof vi.fn>
  onDelete: ReturnType<typeof vi.fn>
} {
  const calls = { onLoad: vi.fn(), onRename: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() }
  render(
    <ConfigurationStrip configurations={configurations} loadedId={null} {...calls} {...over} />
  )
  return calls
}

function row(name: string): ReturnType<typeof within> {
  return within(screen.getByRole("listitem", { name }))
}

/** Opens a row's menu the way a keyboard does, since jsdom sends no pointer events. */
function openMenu(name: string): void {
  fireEvent.keyDown(row(name).getByRole("button", { name: `More for ${name}` }), { key: "Enter" })
}

describe("ConfigurationStrip", () => {
  it("lists each configuration with when it changed, and marks one whose slots have gone", () => {
    renderStrip({ loadedId: 1 })

    expect(row("Anna").getByText("loaded")).toBeInTheDocument()
    expect(
      row("Anna")
        .getByText(/16 Oct/)
        .closest("time")
    ).toHaveAttribute("dateTime", "2026-10-16T12:30:00.000Z")
    expect(row("Anna").queryByText(/No longer in the workflow/)).not.toBeInTheDocument()
    expect(
      row("Bea").getByText("No longer in the workflow: Turbo steps, Voice")
    ).toBeInTheDocument()
  })

  it("says so when nothing is saved", () => {
    renderStrip({ configurations: [] })

    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
  })

  it("loads a configuration", () => {
    const { onLoad } = renderStrip()

    fireEvent.click(row("Bea").getByRole("button", { name: "Load" }))

    expect(onLoad).toHaveBeenCalledWith(2)
  })

  it("renames a configuration in place", () => {
    const { onRename } = renderStrip()

    openMenu("Anna")
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }))
    const field = screen.getByLabelText("New name for Anna")
    fireEvent.change(field, { target: { value: "Anna, dusk" } })
    fireEvent.keyDown(field, { key: "Enter" })

    expect(onRename).toHaveBeenCalledWith(1, "Anna, dusk")
    expect(screen.queryByLabelText("New name for Anna")).not.toBeInTheDocument()
  })

  it("leaves the name as it was when a rename is abandoned", () => {
    const { onRename } = renderStrip()

    openMenu("Anna")
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }))
    const field = screen.getByLabelText("New name for Anna")
    fireEvent.change(field, { target: { value: "Something else" } })
    fireEvent.keyDown(field, { key: "Escape" })

    expect(onRename).not.toHaveBeenCalled()
  })

  it("duplicates a configuration", () => {
    const { onDuplicate } = renderStrip()

    openMenu("Bea")
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }))

    expect(onDuplicate).toHaveBeenCalledWith(2)
  })

  it("asks in the row before deleting, and keeps it when told to", () => {
    const { onDelete } = renderStrip()

    openMenu("Anna")
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))
    expect(row("Anna").getByText("Delete Anna?")).toBeInTheDocument()
    fireEvent.click(row("Anna").getByRole("button", { name: "Keep" }))
    expect(onDelete).not.toHaveBeenCalled()

    openMenu("Anna")
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))
    fireEvent.click(row("Anna").getByRole("button", { name: "Delete" }))
    expect(onDelete).toHaveBeenCalledWith(1)
  })
})
