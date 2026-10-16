import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { RunRecord } from "@renderer/lib/trpc"
import { RunList } from "./run-list"

function run(over: Partial<RunRecord>): RunRecord {
  return {
    id: 1,
    workflowId: 3,
    configurationId: null,
    configurationName: null,
    promptId: "a1b2",
    state: "queued",
    seed: 42,
    error: null,
    bindings: [],
    createdAt: "2026-03-04T05:06:07.000Z",
    finishedAt: null,
    outputs: [],
    ...over,
  }
}

const runs: RunRecord[] = [
  run({
    id: 4,
    state: "done",
    outputs: [
      {
        id: 9,
        runId: 4,
        path: "outputs/run-4/clip.mp4",
        sourceFilename: "clip_00001_.mp4",
        media: "video",
        verdict: null,
        note: "",
      },
      {
        id: 10,
        runId: 4,
        path: "outputs/run-4/log.json",
        sourceFilename: "log.json",
        media: "other",
        verdict: null,
        note: "",
      },
    ],
  }),
  run({ id: 3, state: "failed", error: "SamplerCustomAdvanced (node 28): Out of memory" }),
  run({ id: 2, state: "running", seed: null }),
  run({ id: 1, state: "queued", seed: 7 }),
]

/** The review and cancel props every list takes, showing every output with nothing cancelling. */
const reviewProps = {
  filter: "all" as const,
  onSetVerdict: vi.fn(),
  onSetNote: vi.fn(),
  cancelError: null,
  cancellingRunIds: new Set<number>(),
  onCancel: vi.fn(),
}

function row(runId: number): ReturnType<typeof within> {
  return within(screen.getByRole("listitem", { name: `Run ${runId}` }))
}

describe("RunList", () => {
  it("names the configuration a run was queued from", () => {
    render(
      <RunList
        runs={[run({ id: 6, configurationId: 2, configurationName: "Anna" }), run({ id: 5 })]}
        positions={{}}
        pollError={null}
        onOpenOutput={vi.fn()}
        {...reviewProps}
      />
    )

    expect(row(6).getByText("Anna")).toBeInTheDocument()
    expect(row(5).queryByText("Anna")).not.toBeInTheDocument()
  })

  it("shows each run's state, seed and outcome", () => {
    render(
      <RunList
        runs={runs}
        positions={{ 1: 2 }}
        pollError={null}
        onOpenOutput={vi.fn()}
        {...reviewProps}
      />
    )

    expect(row(1).getByText("Queued, position 2")).toBeInTheDocument()
    expect(row(1).getByText("Seed 7")).toBeInTheDocument()
    expect(row(2).getByText("Running")).toBeInTheDocument()
    expect(row(2).getByText("No seed")).toBeInTheDocument()
    expect(row(3).getByText("Failed")).toBeInTheDocument()
    expect(row(3).getByText("SamplerCustomAdvanced (node 28): Out of memory")).toBeInTheDocument()
    expect(row(4).getByText("Done")).toBeInTheDocument()
    expect(row(4).getByText("clip.mp4")).toBeInTheDocument()
  })

  it("shows a queued run without a place until a poll gives one", () => {
    render(
      <RunList
        runs={[run({})]}
        positions={{}}
        pollError={null}
        onOpenOutput={vi.fn()}
        {...reviewProps}
      />
    )

    expect(row(1).getByText("Queued")).toBeInTheDocument()
  })

  it("opens an output it cannot show when its name is clicked", () => {
    const onOpenOutput = vi.fn()
    render(
      <RunList
        runs={runs}
        positions={{}}
        pollError={null}
        onOpenOutput={onOpenOutput}
        {...reviewProps}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Open log.json" }))

    expect(onOpenOutput).toHaveBeenCalledWith(10)
  })

  it("shows queued and running runs whatever the filter, without saying no outputs match", () => {
    render(
      <RunList
        runs={runs}
        positions={{}}
        pollError={null}
        onOpenOutput={vi.fn()}
        {...reviewProps}
        filter="good"
      />
    )

    expect(row(1).getByText("Queued")).toBeInTheDocument()
    expect(row(2).getByText("Running")).toBeInTheDocument()
    expect(screen.queryByRole("listitem", { name: "Run 3" })).not.toBeInTheDocument()
    expect(screen.queryByRole("listitem", { name: "Run 4" })).not.toBeInTheDocument()
    expect(screen.queryByText("No outputs match.")).not.toBeInTheDocument()
  })

  it("says no outputs match when only finished runs were left out", () => {
    render(
      <RunList
        runs={runs.filter((entry) => entry.state === "done" || entry.state === "failed")}
        positions={{}}
        pollError={null}
        onOpenOutput={vi.fn()}
        {...reviewProps}
        filter="bad"
      />
    )

    expect(screen.getByText("No outputs match.")).toBeInTheDocument()
  })

  it("offers to cancel only queued and running runs, and asks for the one clicked", () => {
    const onCancel = vi.fn()
    render(
      <RunList
        runs={runs}
        positions={{}}
        pollError={null}
        onOpenOutput={vi.fn()}
        {...reviewProps}
        onCancel={onCancel}
      />
    )

    expect(row(1).getByRole("button", { name: "Cancel run 1" })).toHaveTextContent("Cancel")
    expect(row(2).getByRole("button", { name: "Cancel run 2" })).toBeEnabled()
    expect(row(3).queryByRole("button", { name: /Cancel/ })).not.toBeInTheDocument()
    expect(row(4).queryByRole("button", { name: /Cancel/ })).not.toBeInTheDocument()
    fireEvent.click(row(2).getByRole("button", { name: "Cancel run 2" }))
    expect(onCancel).toHaveBeenCalledWith(2)
  })

  it("holds a cancel button while its cancel is answered, and shows why one failed", () => {
    render(
      <RunList
        runs={runs}
        positions={{}}
        pollError={null}
        onOpenOutput={vi.fn()}
        {...reviewProps}
        cancellingRunIds={new Set([1])}
        cancelError="Run 2 is neither waiting nor running in ComfyUI, so there was nothing to cancel."
      />
    )

    const button = row(1).getByRole("button", { name: "Cancel run 1" })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent("Cancelling…")
    expect(row(2).getByRole("button", { name: "Cancel run 2" })).toBeEnabled()
    expect(
      screen.getByText(
        "Run 2 is neither waiting nor running in ComfyUI, so there was nothing to cancel."
      )
    ).toBeInTheDocument()
  })

  it("says when nothing has been queued, and when ComfyUI could not be asked", () => {
    render(
      <RunList
        runs={[]}
        positions={{}}
        pollError="No answer."
        onOpenOutput={vi.fn()}
        {...reviewProps}
      />
    )

    expect(screen.getByText("Nothing queued yet.")).toBeInTheDocument()
    expect(screen.getByText("Could not ask ComfyUI how runs stand: No answer.")).toBeInTheDocument()
  })
})
