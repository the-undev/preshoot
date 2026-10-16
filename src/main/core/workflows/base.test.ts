import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import {
  MIN_BASE_MATCHES,
  MIN_BASE_SCORE,
  matchSlots,
  pickBase,
  scoreBase,
  suggestBase,
  type SlotIdentity,
} from "./base"
import { FIXTURE_NAMES, fixtureText } from "./fixtures"
import { readGraph, scanGraph } from "./scan"
import { importWorkflow, type WorkflowDetail } from "./store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

type FixtureName = (typeof FIXTURE_NAMES)[number]

/** A fixture workflow's slots as its scan finds them. */
function slotsOf(name: FixtureName): SlotIdentity[] {
  return scanGraph(readGraph(`${name}.json`, fixtureText(name))).slots
}

function slot(nodeType: string, name: string): SlotIdentity {
  return { nodeType, name }
}

describe("matchSlots", () => {
  it("pairs slots by node type and scanned name, each slot once", () => {
    const pairs = matchSlots(
      [slot("LoadImage", "Picture"), slot("LoadImage", "Picture"), slot("RandomNoise", "Seed")],
      [slot("LoadImage", "Picture"), slot("PrimitiveInt", "Seed"), slot("RandomNoise", "Seed")]
    )

    expect(pairs.map(([own, other]) => [own.name, other.nodeType])).toEqual([
      ["Picture", "LoadImage"],
      ["Seed", "RandomNoise"],
    ])
  })
})

describe("scoreBase", () => {
  it("scores the two h3 workflows above the threshold", () => {
    const score = scoreBase(slotsOf("h3-fl2v-base"), slotsOf("h3-r2v-base"))

    expect(score).toEqual({ matches: 7, score: 7 / 11 })
    expect(score.score).toBeGreaterThanOrEqual(MIN_BASE_SCORE)
    expect(score.matches).toBeGreaterThanOrEqual(MIN_BASE_MATCHES)
  })

  it("scores qwen-edit below the threshold against either h3 workflow", () => {
    for (const h3 of ["h3-r2v-base", "h3-fl2v-base"] as const) {
      const score = scoreBase(slotsOf("qwen-edit-2511-edit-base"), slotsOf(h3))

      expect(score).toEqual({ matches: 6, score: 6 / 22 })
      expect(score.score).toBeLessThan(MIN_BASE_SCORE)
    }
  })

  it("scores two workflows with no slots as sharing nothing", () => {
    expect(scoreBase([], [])).toEqual({ matches: 0, score: 0 })
  })
})

describe("pickBase", () => {
  const candidate = (id: number, name: FixtureName): Parameters<typeof pickBase>[1][number] => ({
    id,
    name,
    slots: slotsOf(name),
  })

  it("offers each h3 workflow as the other's base", () => {
    expect(
      pickBase(slotsOf("h3-fl2v-base"), [
        candidate(1, "h3-r2v-base"),
        candidate(2, "qwen-edit-2511-edit-base"),
      ])
    ).toEqual({ workflowId: 1, name: "h3-r2v-base", matchingSlots: 7 })
    expect(
      pickBase(slotsOf("h3-r2v-base"), [
        candidate(2, "qwen-edit-2511-edit-base"),
        candidate(3, "h3-fl2v-base"),
      ])
    ).toEqual({ workflowId: 3, name: "h3-fl2v-base", matchingSlots: 7 })
  })

  it("offers neither h3 workflow as qwen-edit's base", () => {
    expect(
      pickBase(slotsOf("qwen-edit-2511-edit-base"), [
        candidate(1, "h3-r2v-base"),
        candidate(3, "h3-fl2v-base"),
      ])
    ).toBeNull()
  })

  it("offers nothing that shares fewer slots than the least, however close", () => {
    const slots = [slot("LoadImage", "Picture"), slot("RandomNoise", "Seed")]

    expect(pickBase(slots, [{ id: 1, name: "Pair", slots }])).toBeNull()
  })

  it("offers the candidate that scores highest, and the earlier of two that tie", () => {
    const slots = ["A", "B", "C", "D"].map((name) => slot("PrimitiveInt", name))
    const threeOfFour = { id: 1, name: "Three", slots: slots.slice(0, 3) }
    const allFour = { id: 2, name: "Four", slots }
    const allFourAgain = { id: 3, name: "Four again", slots }

    expect(pickBase(slots, [threeOfFour, allFour, allFourAgain])).toEqual({
      workflowId: 2,
      name: "Four",
      matchingSlots: 4,
    })
  })
})

describe("suggestBase", () => {
  let dir: string
  let folder: string
  let handle: ProjectDatabaseHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-base-"))
    folder = join(dir, "workflows")
    mkdirSync(folder)
    for (const name of FIXTURE_NAMES) writeFileSync(join(folder, `${name}.json`), fixtureText(name))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function imported(name: FixtureName): WorkflowDetail {
    return importWorkflow(handle.db, { folder, sourcePath: join(folder, `${name}.json`) })
  }

  it("offers nothing for the project's first workflow", () => {
    expect(suggestBase(handle.db, imported("h3-r2v-base").id)).toBeNull()
  })

  it("offers the other h3 workflow, and nothing for qwen-edit", () => {
    const r2v = imported("h3-r2v-base")
    const fl2v = imported("h3-fl2v-base")
    const qwen = imported("qwen-edit-2511-edit-base")

    expect(suggestBase(handle.db, fl2v.id)).toEqual({
      workflowId: r2v.id,
      name: "h3-r2v-base",
      matchingSlots: 7,
    })
    expect(suggestBase(handle.db, qwen.id)).toBeNull()
  })
})
