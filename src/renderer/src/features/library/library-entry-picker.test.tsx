import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { LibraryFolder } from "@renderer/lib/trpc"
import { StubTrpcProvider } from "@renderer/lib/stub-trpc"
import { LibraryEntryPicker } from "./library-entry-picker"

function renderPicker(folder: LibraryFolder): void {
  render(
    <StubTrpcProvider answers={{ "library.entries": folder }}>
      <LibraryEntryPicker onPick={vi.fn()} onCancel={vi.fn()} />
    </StubTrpcProvider>
  )
}

describe("LibraryEntryPicker", () => {
  it("says when no library folder is set", async () => {
    renderPicker({ state: "unset" })

    expect(
      await screen.findByText(
        "No library folder is set. Name one in settings and its entries with pictures are offered here."
      )
    ).toBeInTheDocument()
  })

  it("says when no entry holds a picture", async () => {
    renderPicker({
      state: "listed",
      folder: "/l",
      kinds: [
        {
          name: "prompts",
          entries: [
            {
              kind: "prompts",
              name: "one-liner",
              path: "/l/prompts/one-liner.txt",
              notes: null,
              files: [],
            },
          ],
        },
      ],
    })

    expect(
      await screen.findByText("The library holds no entries with pictures yet.")
    ).toBeInTheDocument()
  })
})
