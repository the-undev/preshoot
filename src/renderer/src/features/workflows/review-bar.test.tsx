import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { OutputExport, VerdictCounts } from "@renderer/lib/trpc"
import { ReviewBar } from "./review-bar"

const counts: VerdictCounts = { all: 6, good: 3, bad: 2, unmarked: 1 }

function renderBar(
  over: { counts?: VerdictCounts; lastExport?: OutputExport | null; isExporting?: boolean } = {}
): { onFilter: ReturnType<typeof vi.fn>; onExport: ReturnType<typeof vi.fn> } {
  const handlers = { onFilter: vi.fn(), onExport: vi.fn() }
  render(
    <ReviewBar
      counts={over.counts ?? counts}
      filter="good"
      isExporting={over.isExporting ?? false}
      lastExport={over.lastExport ?? null}
      {...handlers}
    />
  )
  return handlers
}

describe("ReviewBar", () => {
  it("counts each filter on its chip and shows which one is picked", () => {
    renderBar()

    expect(screen.getByRole("button", { name: "All 6" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Good 3" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Bad 2" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Unmarked 1" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("picks a filter", () => {
    const { onFilter } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: "Unmarked 1" }))

    expect(onFilter).toHaveBeenCalledWith("unmarked")
  })

  it("exports the good outputs, counting them on the button", () => {
    const { onExport } = renderBar()

    fireEvent.click(screen.getByRole("button", { name: "Export good outputs 3" }))

    expect(onExport).toHaveBeenCalled()
  })

  it("cannot export when nothing is marked good", () => {
    renderBar({ counts: { all: 2, good: 0, bad: 1, unmarked: 1 } })
    expect(screen.getByRole("button", { name: "Export good outputs 0" })).toBeDisabled()
  })

  it("cannot export again while an export runs", () => {
    renderBar({ isExporting: true })
    expect(screen.getByRole("button", { name: "Export good outputs 3" })).toBeDisabled()
  })

  it("says how many files an export wrote and where", () => {
    renderBar({
      lastExport: {
        state: "written",
        folder: "/picked",
        paths: ["/picked/a.png", "/picked/b.png"],
      },
    })

    expect(screen.getByText("Wrote 2 files to /picked.")).toBeInTheDocument()
  })

  it("says one file in the singular", () => {
    renderBar({ lastExport: { state: "written", folder: "/picked", paths: ["/picked/a.png"] } })

    expect(screen.getByText("Wrote 1 file to /picked.")).toBeInTheDocument()
  })

  it("says when there was nothing to export", () => {
    renderBar({ lastExport: { state: "nothing" } })
    expect(
      screen.getByText("No outputs are marked good, so nothing was written.")
    ).toBeInTheDocument()
  })

  it("says nothing when the folder pick was cancelled", () => {
    renderBar({ lastExport: { state: "cancelled" } })
    expect(screen.queryByText(/Wrote|nothing was written/)).not.toBeInTheDocument()
  })
})
