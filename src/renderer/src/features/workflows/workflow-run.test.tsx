import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Configuration, WorkflowDetail, WorkflowSlot } from "@renderer/lib/trpc"
import type { ConfigurationsPanel } from "./use-configurations"
import type { RunFormPanel, RunsPanel } from "./use-runs"
import { WorkflowRunView } from "./workflow-run"

function slot(over: Partial<WorkflowSlot>): WorkflowSlot {
  return {
    id: 1,
    workflowId: 3,
    nodeId: 14,
    nodeType: "PrimitiveStringMultiline",
    name: "Prompt",
    kind: "text",
    tier: "basic",
    bypassed: false,
    position: 0,
    ...over,
  }
}

const workflow: WorkflowDetail = {
  id: 3,
  name: "h3-r2v-base",
  sourcePath: "/workflows/h3-r2v-base.json",
  contentHash: "abc",
  importedAt: "2026-10-16T09:00:00.000Z",
  updatedAt: "2026-10-16T09:00:00.000Z",
  guide: [],
  slots: [
    slot({}),
    slot({ id: 7, nodeId: 23, nodeType: "RandomNoise", name: "Seed", kind: "seed", position: 1 }),
  ],
}

function configuration(over: Partial<Configuration>): Configuration {
  return {
    id: 5,
    workflowId: 3,
    name: "Anna",
    staleSlotNames: [],
    createdAt: "2026-10-16T09:00:00.000Z",
    updatedAt: "2026-10-16T12:00:00.000Z",
    ...over,
  }
}

function formPanel(): RunFormPanel {
  return {
    savedValues: [
      { slotId: 1, value: "A man at a window." },
      { slotId: 7, value: 42 },
    ],
    blockedReason: null,
    isQueueing: false,
    queue: vi.fn(),
    pickFile: async () => null,
    library: { state: "unset" },
    errorMessage: null,
  }
}

const runsPanel: RunsPanel = { runs: [], positions: {}, pollError: null, openOutput: vi.fn() }

function configurationsPanel(over: Partial<ConfigurationsPanel> = {}): ConfigurationsPanel {
  return {
    configurations: [],
    load: vi.fn(),
    saveNew: vi.fn(),
    update: vi.fn(),
    rename: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    errorMessage: null,
    ...over,
  }
}

describe("WorkflowRunView", () => {
  it("loads a stale configuration's surviving values and names the slots that went", async () => {
    const stale = configuration({ staleSlotNames: ["Turbo steps"] })
    const form = formPanel()
    const configurations = configurationsPanel({
      configurations: [stale],
      load: vi.fn(async () => ({
        configuration: stale,
        bindings: [{ slotId: 1, on: true, value: { type: "value" as const, value: "She turns." } }],
      })),
    })
    render(
      <WorkflowRunView
        workflow={workflow}
        form={form}
        configurations={configurations}
        runs={runsPanel}
      />
    )
    expect(screen.getByText("No longer in the workflow: Turbo steps")).toBeInTheDocument()

    await act(async () =>
      fireEvent.click(
        within(screen.getByRole("listitem", { name: "Anna" })).getByRole("button", {
          name: "Load",
        })
      )
    )

    expect(configurations.load).toHaveBeenCalledWith(5)
    expect(
      screen.getByText("No longer in the workflow, so not loaded: Turbo steps.")
    ).toBeInTheDocument()
    expect(screen.getByText("Filled from Anna.")).toBeInTheDocument()
    expect(screen.getByLabelText("Prompt")).toHaveValue("She turns.")
    expect(screen.getByLabelText("Seed")).toHaveValue("42")

    fireEvent.change(screen.getByLabelText("Number of runs"), { target: { value: "4" } })
    fireEvent.click(screen.getByRole("button", { name: "Queue" }))
    expect(form.queue).toHaveBeenCalledWith(
      [
        { slotId: 1, on: true, value: { type: "value", value: "She turns." } },
        { slotId: 7, on: true, value: { type: "value", value: 42 } },
      ],
      4,
      5
    )
  })

  it("queues a form filled by hand with no configuration", () => {
    const form = formPanel()
    render(
      <WorkflowRunView
        workflow={workflow}
        form={form}
        configurations={configurationsPanel()}
        runs={runsPanel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Queue" }))

    expect(form.queue).toHaveBeenCalledWith(expect.any(Array), 1, null)
  })

  it("treats a configuration just saved as loaded, so the next save can update it", async () => {
    const saved = configuration({})
    const configurations = configurationsPanel({ saveNew: vi.fn(async () => saved) })
    const { rerender } = render(
      <WorkflowRunView
        workflow={workflow}
        form={formPanel()}
        configurations={configurations}
        runs={runsPanel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Save as configuration" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Anna" } })
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Save" })))
    // The list is read again once the save lands.
    rerender(
      <WorkflowRunView
        workflow={workflow}
        form={formPanel()}
        configurations={{ ...configurations, configurations: [saved] }}
        runs={runsPanel}
      />
    )

    expect(screen.getByText("Filled from Anna.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save as configuration" }))
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Update Anna" })
    ).toBeInTheDocument()
  })
})
