import { describe, expect, it } from "vitest"
import type { LineInput } from "@renderer/lib/trpc"
import { NO_SUBJECT, withChosenSubject } from "./line-input"

function line(over: Partial<LineInput> = {}): LineInput {
  return {
    kind: "action",
    subjectIds: [],
    text: "climbs the last steps",
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
    ...over,
  }
}

describe("withChosenSubject", () => {
  it("puts a line on whoever was picked", () => {
    expect(withChosenSubject(line(), "5")).toEqual(expect.objectContaining({ subjectIds: [5] }))
  })

  it("leaves a line that shows something as one, holding its own words", () => {
    const shown = line({ kind: "shows", subjectIds: [5], text: "the lamp room, unlit" })

    expect(withChosenSubject(shown, NO_SUBJECT)).toEqual(
      expect.objectContaining({ kind: "shows", subjectIds: [], text: "the lamp room, unlit" })
    )
  })

  it("leaves something that happens as it is", () => {
    const happens = line({ subjectIds: [5] })

    expect(withChosenSubject(happens, NO_SUBJECT)).toEqual(
      expect.objectContaining({ kind: "action", subjectIds: [] })
    )
  })

  it("leaves what a line is alone when somebody is picked", () => {
    const said = line({ kind: "speech", subjectIds: [7] })

    expect(withChosenSubject(said, "8").kind).toBe("speech")
  })

  it("keeps everything else about the line", () => {
    const said = line({ subjectIds: [7], language: "French", offScreen: true })

    expect(withChosenSubject(said, NO_SUBJECT)).toEqual(
      expect.objectContaining({ language: "French", offScreen: true })
    )
  })
})
