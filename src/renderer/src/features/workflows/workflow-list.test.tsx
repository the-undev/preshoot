import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { WorkflowFolder, WorkflowSummary } from "@renderer/lib/trpc"
import { WorkflowList } from "./workflow-list"

const imported: WorkflowSummary = {
  id: 3,
  name: "h3-r2v-base",
  sourcePath: "/w/Base/h3-r2v-base.json",
  contentHash: "a".repeat(64),
  importedAt: "2026-10-16T08:00:00.000Z",
  updatedAt: "2026-10-16T08:00:00.000Z",
}

const listed: WorkflowFolder = {
  state: "listed",
  folder: "/w",
  files: [
    {
      name: "h3-r2v-base",
      path: "/w/Base/h3-r2v-base.json",
      relativePath: "Base/h3-r2v-base.json",
      importedWorkflowId: 3,
    },
    {
      name: "qwen-edit-2511-edit-base",
      path: "/w/qwen-edit-2511-edit-base.json",
      relativePath: "qwen-edit-2511-edit-base.json",
      importedWorkflowId: null,
    },
  ],
}

function renderList(over: Partial<React.ComponentProps<typeof WorkflowList>> = {}): {
  onOpen: ReturnType<typeof vi.fn>
  onImport: ReturnType<typeof vi.fn>
  onOpenSettings: ReturnType<typeof vi.fn>
  onRefresh: ReturnType<typeof vi.fn>
} {
  const onOpen = vi.fn()
  const onImport = vi.fn()
  const onOpenSettings = vi.fn()
  const onRefresh = vi.fn()
  render(
    <WorkflowList
      folder={listed}
      workflows={[imported]}
      selectedId={null}
      isImporting={false}
      onOpen={onOpen}
      onImport={onImport}
      onRefresh={onRefresh}
      onOpenSettings={onOpenSettings}
      {...over}
    />
  )
  return { onOpen, onImport, onOpenSettings, onRefresh }
}

describe("WorkflowList", () => {
  it("explains how to name a folder when none is set", () => {
    const { onOpenSettings } = renderList({ folder: { state: "unset" }, workflows: [] })

    expect(screen.getByText(/No workflows folder is set/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it("says when the folder named in settings is not there", () => {
    renderList({ folder: { state: "missing", folder: "/gone" } })

    expect(screen.getByText(/The workflows folder is not there/)).toBeInTheDocument()
    expect(screen.getByText("/gone")).toBeInTheDocument()
  })

  it("imports a file the project does not hold yet", () => {
    const { onImport } = renderList()

    fireEvent.click(screen.getByRole("button", { name: "Import qwen-edit-2511-edit-base" }))

    expect(onImport).toHaveBeenCalledWith("/w/qwen-edit-2511-edit-base.json")
  })

  it("opens the project's copy of a file it already holds rather than importing it again", () => {
    const { onOpen, onImport } = renderList()

    expect(screen.queryByRole("button", { name: "Import h3-r2v-base" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open h3-r2v-base" }))

    expect(onOpen).toHaveBeenCalledWith(3)
    expect(onImport).not.toHaveBeenCalled()
  })

  it("shows where each file sits in the folder", () => {
    renderList()

    expect(screen.getByText("Base/h3-r2v-base.json")).toBeInTheDocument()
  })

  it("opens a workflow the project holds", () => {
    const { onOpen } = renderList()

    fireEvent.click(screen.getByRole("button", { name: "h3-r2v-base" }))

    expect(onOpen).toHaveBeenCalledWith(3)
  })

  it("reads the folder again when asked", () => {
    const { onRefresh } = renderList()

    fireEvent.click(screen.getByRole("button", { name: "Read the workflows folder again" }))

    expect(onRefresh).toHaveBeenCalled()
  })
})
