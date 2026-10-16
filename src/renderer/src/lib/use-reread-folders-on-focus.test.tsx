import { useQuery } from "@tanstack/react-query"
import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { StubTrpcProvider } from "./stub-trpc"
import { useTRPC } from "./trpc"
import { useRereadFoldersOnFocus } from "./use-reread-folders-on-focus"

/** Reads every folder-shaped query and the clip list, and rereads on focus. */
function Reader(): React.JSX.Element {
  const trpc = useTRPC()
  useQuery(trpc.workflows.files.queryOptions())
  useQuery(trpc.library.entries.queryOptions())
  useQuery(trpc.workflows.checkSource.queryOptions({ workflowId: 3 }))
  useQuery(trpc.clips.list.queryOptions())
  useRereadFoldersOnFocus()
  return <p>Reading</p>
}

function renderReader(): {
  answers: Record<string, ReturnType<typeof vi.fn>>
  unmount: () => void
} {
  const answers = {
    "workflows.files": vi.fn(() => ({ state: "unset" })),
    "library.entries": vi.fn(() => ({ state: "unset" })),
    "workflows.checkSource": vi.fn(() => ({ state: "current" })),
    "clips.list": vi.fn(() => []),
  }
  const view = render(
    <StubTrpcProvider answers={answers}>
      <Reader />
    </StubTrpcProvider>
  )
  return { answers, unmount: view.unmount }
}

describe("useRereadFoldersOnFocus", () => {
  it("reads the folders and the open workflow's source again when the window gains focus", async () => {
    const { answers } = renderReader()
    await waitFor(() => expect(answers["workflows.checkSource"]).toHaveBeenCalledTimes(1))

    await act(async () => fireEvent.focus(window))

    await waitFor(() => expect(answers["workflows.files"]).toHaveBeenCalledTimes(2))
    expect(answers["library.entries"]).toHaveBeenCalledTimes(2)
    expect(answers["workflows.checkSource"]).toHaveBeenCalledTimes(2)
    expect(answers["workflows.checkSource"]).toHaveBeenLastCalledWith({ workflowId: 3 })
    expect(answers["clips.list"]).toHaveBeenCalledTimes(1)
  })

  it("stops listening once it is off screen", async () => {
    const { answers, unmount } = renderReader()
    await waitFor(() => expect(answers["library.entries"]).toHaveBeenCalledTimes(1))
    unmount()

    fireEvent.focus(window)

    expect(answers["library.entries"]).toHaveBeenCalledTimes(1)
  })
})
