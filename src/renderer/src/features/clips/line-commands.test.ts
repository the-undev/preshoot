import { describe, expect, it, vi } from "vitest"
import type { LineInput, SubjectComposition, Vocabularies } from "@renderer/lib/trpc"
import { lineCommands, wordAt, type LineMenuContext } from "./line-commands"

const vocabularies: Vocabularies = {
  cameraMotions: ["push in"],
  amplitudes: ["with small amplitude"],
  speeds: ["at slow speed"],
  transitions: ["the camera cuts to"],
  styles: ["Live-action"],
  lightings: ["night"],
}

const keeper: SubjectComposition = {
  id: 5,
  kind: "person",
  name: "Keeper",
  description: "an elderly man",
  voice: null,
}

function line(over: Partial<LineInput> = {}): LineInput {
  return {
    kind: "action",
    subjectIds: [],
    text: "",
    language: null,
    offScreen: false,
    crossesCut: false,
    cutOff: false,
    ...over,
  }
}

function menuContext(over: Partial<LineMenuContext> = {}): LineMenuContext {
  return {
    vocabularies,
    savedShots: [],
    savedSubjects: [],
    onAddSavedShot: vi.fn(),
    onAddSavedSubject: vi.fn(),
    onAddSubject: vi.fn(),
    onNewShot: vi.fn(),
    onSaveShot: vi.fn(),
    onSetShotField: vi.fn(),
    ...over,
  }
}

function build(
  over: Partial<Parameters<typeof lineCommands>[0]> = {}
): ReturnType<typeof lineCommands> {
  return lineCommands({
    line: line(),
    word: "",
    subjects: [keeper],
    speakers: [keeper],
    menu: menuContext(),
    onSetKind: vi.fn(),
    onShowSubject: vi.fn(),
    ...over,
  })
}

/** What the menu offers, by name, which is what the box filters on. */
function labels(commands: ReturnType<typeof lineCommands>): string[] {
  return commands.map((command) => command.label)
}

describe("lineCommands", () => {
  it("offers the kinds a line is not already", () => {
    expect(labels(build())).toContain("Show something")
    expect(labels(build())).toContain("Make this something that is said")
    expect(labels(build())).not.toContain("Make this something that happens")
  })

  it("offers to show something whether or not the clip has a cast", () => {
    expect(labels(build({ subjects: [], speakers: [] }))).toContain("Show something")
  })

  it("does not offer to make a line said when nobody can say it", () => {
    expect(labels(build({ subjects: [], speakers: [] }))).not.toContain(
      "Make this something that is said"
    )
  })

  it("keeps who a line was about when it becomes something said", () => {
    const onSetKind = vi.fn()
    const commands = build({ onSetKind })

    commands.find((command) => command.id === "kind-speech")?.run()

    expect(onSetKind).toHaveBeenCalledWith("speech")
  })

  it("shows one of the cast on a line of its own", () => {
    const onShowSubject = vi.fn()
    const commands = build({ onShowSubject })

    commands.find((command) => command.label === "Show Keeper")?.run()

    expect(onShowSubject).toHaveBeenCalledWith(5)
  })

  it("offers to make the word the cursor is in a subject", () => {
    const onAddSubject = vi.fn()
    const commands = build({ word: "Radio", menu: menuContext({ onAddSubject }) })

    commands.find((command) => command.id === "add-subject")?.run()

    expect(onAddSubject).toHaveBeenCalledWith("Radio")
  })

  it("does not offer to add a subject the clip already has", () => {
    expect(labels(build({ word: "Keeper" }))).not.toContain("Add Keeper to the cast")
  })

  it("offers nothing to add when the cursor is not in a word", () => {
    expect(build({ word: "  " }).some((command) => command.id === "add-subject")).toBe(false)
  })

  it("sets a word of the shot's vocabulary", () => {
    const onSetShotField = vi.fn()
    const commands = build({ menu: menuContext({ onSetShotField }) })

    commands.find((command) => command.id === "cameraMotion-push in")?.run()

    expect(onSetShotField).toHaveBeenCalledWith({ cameraMotion: "push in" })
  })

  it("says add rather than new, since the shot goes on the end of the clip", () => {
    const onNewShot = vi.fn()
    const commands = build({ menu: menuContext({ onNewShot }) })

    commands.find((command) => command.label === "Add shot")?.run()

    expect(onNewShot).toHaveBeenCalled()
  })

  it("groups each part of the shot under its own heading", () => {
    const groups = new Set(build().map((command) => command.group))

    expect(groups).toContain("Camera")
    expect(groups).toContain("Lighting")
    expect(groups).toContain("Shot")
  })

  it("offers the shots the library holds", () => {
    const onAddSavedShot = vi.fn()
    const commands = build({
      menu: menuContext({
        savedShots: [{ id: 3, name: "Establishing", lines: 2, durationMs: 4000 }],
        onAddSavedShot,
      }),
    })

    commands.find((command) => command.label === "Add the saved shot Establishing")?.run()

    expect(onAddSavedShot).toHaveBeenCalledWith(3)
  })
})

describe("lineCommands and the library", () => {
  it("offers the subjects the library holds", () => {
    const onAddSavedSubject = vi.fn()
    const commands = build({
      menu: menuContext({
        savedSubjects: [
          {
            id: 9,
            clipId: null,
            kind: "object",
            name: "Lamp",
            description: "brass and glass",
            voice: null,
            createdAt: "2026-09-12T08:00:00.000Z",
          },
        ],
        onAddSavedSubject,
      }),
    })

    commands.find((command) => command.label === "Add Lamp from the library")?.run()

    expect(onAddSavedSubject).toHaveBeenCalledWith(9)
  })

  it("does not offer a saved subject the clip already has under that name", () => {
    const commands = build({
      menu: menuContext({
        savedSubjects: [
          {
            id: 9,
            clipId: null,
            kind: "person",
            name: "Keeper",
            description: "an elderly man",
            voice: null,
            createdAt: "2026-09-12T08:00:00.000Z",
          },
        ],
      }),
    })

    expect(labels(commands)).not.toContain("Add Keeper from the library")
  })
})

describe("wordAt", () => {
  it("takes the word the cursor is inside", () => {
    expect(wordAt("the keeper climbs", 8)).toBe("keeper")
  })

  it("takes the word the cursor is at the end of", () => {
    expect(wordAt("the keeper", 10)).toBe("keeper")
  })

  it("takes nothing when the cursor is on a space", () => {
    expect(wordAt("the keeper", 4)).toBe("keeper")
    expect(wordAt("the  keeper", 4)).toBe("")
  })

  it("takes nothing from an empty line", () => {
    expect(wordAt("", 0)).toBe("")
  })
})
