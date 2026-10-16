import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SlotDiff, SourceStatus } from "@renderer/lib/trpc"
import { WorkflowSource } from "./workflow-source"

const diff: SlotDiff = {
  kept: [
    { id: 1, nodeId: 14, nodeType: "PrimitiveStringMultiline", name: "Prompt", displayName: null },
  ],
  renamed: [{ slotId: 2, nodeId: 18, from: "Duration (s)", to: "Length (s)", displayName: null }],
  added: [
    {
      nodeId: 33,
      nodeType: "LoadAudio",
      name: "Voice",
      kind: "audio",
      tier: "basic",
      startsOff: false,
      multiline: false,
      position: 3,
    },
  ],
  removed: [
    { id: 4, nodeId: 21, nodeType: "PrimitiveInt", name: "Turbo steps", displayName: null },
  ],
}

function renderSource(status: SourceStatus | undefined): {
  onApply: ReturnType<typeof vi.fn>
  onRefresh: ReturnType<typeof vi.fn>
} {
  const onApply = vi.fn()
  const onRefresh = vi.fn()
  render(
    <WorkflowSource
      status={status}
      isChecking={false}
      isApplying={false}
      onRefresh={onRefresh}
      onApply={onApply}
    />
  )
  return { onApply, onRefresh }
}

describe("WorkflowSource", () => {
  it("says when the copy is in step with its source", () => {
    renderSource({ state: "in-sync" })

    expect(screen.getByText("In step with the source file.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Apply the changes" })).not.toBeInTheDocument()
  })

  it("says quietly that the source is gone and the copy still works", () => {
    renderSource({ state: "missing" })

    expect(screen.getByText(/not there any more/)).toBeInTheDocument()
    expect(screen.getByText(/still works/)).toBeInTheDocument()
  })

  it("lists what a changed source renames, adds and removes", () => {
    renderSource({
      state: "changed",
      contentHash: "b".repeat(64),
      diff,
      boundConfigurationNames: [],
    })

    expect(
      within(screen.getByRole("region", { name: "Renamed" })).getByText("Duration (s) → Length (s)")
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "Added" })).getByText(/Voice/)
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "Added" })).getByText("· Audio")
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "Removed" })).getByText("Turbo steps")
    ).toBeInTheDocument()
    expect(screen.getByText(/1 slot is kept as they are/)).toBeInTheDocument()
  })

  it("says what a renamed or removed slot is shown as, beside its scanned name", () => {
    renderSource({
      state: "changed",
      contentHash: "b".repeat(64),
      diff: {
        ...diff,
        renamed: [{ ...diff.renamed[0], displayName: "Length" }],
        removed: [{ ...diff.removed[0], displayName: "Fast steps" }],
      },
      boundConfigurationNames: [],
    })

    const renamed = within(screen.getByRole("region", { name: "Renamed" }))
    expect(renamed.getByText(/Duration \(s\) → Length \(s\)/)).toBeInTheDocument()
    expect(renamed.getByText("· shown as Length")).toBeInTheDocument()
    const removed = within(screen.getByRole("region", { name: "Removed" }))
    expect(removed.getByText(/Turbo steps/)).toBeInTheDocument()
    expect(removed.getByText("· shown as Fast steps")).toBeInTheDocument()
  })

  it("shows no display name for a slot that has none", () => {
    renderSource({
      state: "changed",
      contentHash: "b".repeat(64),
      diff,
      boundConfigurationNames: [],
    })

    expect(screen.queryByText(/shown as/)).not.toBeInTheDocument()
  })

  it("names the configurations that bind a removed slot", () => {
    renderSource({
      state: "changed",
      contentHash: "b".repeat(64),
      diff,
      boundConfigurationNames: ["Anna at the window", "Night walk"],
    })

    expect(
      screen.getByText("Configurations that bind a removed slot: Anna at the window, Night walk.")
    ).toBeInTheDocument()
  })

  it("names no configurations when none binds a removed slot", () => {
    renderSource({
      state: "changed",
      contentHash: "b".repeat(64),
      diff,
      boundConfigurationNames: [],
    })

    expect(screen.queryByText(/Configurations that bind a removed slot/)).not.toBeInTheDocument()
  })

  it("applies the changes it showed, by their hash", () => {
    const { onApply } = renderSource({
      state: "changed",
      contentHash: "b".repeat(64),
      diff,
      boundConfigurationNames: [],
    })

    fireEvent.click(screen.getByRole("button", { name: "Apply the changes" }))

    expect(onApply).toHaveBeenCalledWith("b".repeat(64))
  })

  it("says quietly that the source was taken in on its own", () => {
    renderSource({ state: "updated" })

    expect(screen.getByText("Updated from the source file.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Apply the changes" })).not.toBeInTheDocument()
  })

  it("checks the source again when asked", () => {
    const { onRefresh } = renderSource({ state: "in-sync" })

    fireEvent.click(screen.getByRole("button", { name: "Check the source file again" }))

    expect(onRefresh).toHaveBeenCalled()
  })
})
