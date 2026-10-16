import { describe, expect, it } from "vitest"
import type { RunRecord, RunStatus } from "@renderer/lib/trpc"
import { changesState } from "./use-runs"

function run(id: number, state: RunRecord["state"]): RunRecord {
  return {
    id,
    workflowId: 3,
    configurationId: null,
    configurationName: null,
    promptId: "a1b2",
    state,
    seed: 42,
    error: null,
    bindings: [],
    createdAt: "2026-03-04T05:06:07.000Z",
    finishedAt: null,
    outputs: [],
  }
}

describe("changesState", () => {
  it("says nothing changed when every run polled is in the state the list shows", () => {
    const statuses: RunStatus[] = [
      { run: run(1, "queued"), position: 2 },
      { run: run(2, "running"), position: null },
    ]

    expect(changesState(statuses, [run(2, "running"), run(1, "queued")])).toBe(false)
  })

  it("says something changed when a run moved on or the list does not have it yet", () => {
    expect(changesState([{ run: run(1, "done"), position: null }], [run(1, "running")])).toBe(true)
    expect(changesState([{ run: run(3, "queued"), position: 1 }], [run(1, "queued")])).toBe(true)
  })
})
