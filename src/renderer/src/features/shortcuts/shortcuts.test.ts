import { describe, expect, it } from "vitest"
import {
  isBareKey,
  matchesShortcut,
  SHORTCUTS,
  shortcutGroups,
  shortcutKeys,
  type Shortcut,
} from "./shortcuts"

function shortcut(id: string): Shortcut {
  const found = SHORTCUTS.find((entry) => entry.id === id)
  if (!found) throw new Error(`No shortcut ${id}`)
  return found
}

function press(key: string, held: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...held,
  } as KeyboardEvent
}

describe("matchesShortcut", () => {
  it("matches the key with its modifier held", () => {
    expect(matchesShortcut(press("t", { ctrlKey: true }), shortcut("newTab"))).toBe(true)
  })

  it("does not match the key on its own", () => {
    expect(matchesShortcut(press("t"), shortcut("newTab"))).toBe(false)
  })

  it("takes the command key for control", () => {
    expect(matchesShortcut(press("t", { metaKey: true }), shortcut("newTab"))).toBe(true)
  })

  it("tells a shortcut apart from the same keys with shift held", () => {
    const withShift = press("Tab", { ctrlKey: true, shiftKey: true })

    expect(matchesShortcut(withShift, shortcut("nextTab"))).toBe(false)
    expect(matchesShortcut(withShift, shortcut("previousTab"))).toBe(true)
  })

  it("matches a bare character whatever shift the layout needed to type it", () => {
    expect(matchesShortcut(press("?", { shiftKey: true }), shortcut("showShortcuts"))).toBe(true)
    expect(matchesShortcut(press("?"), shortcut("showShortcuts"))).toBe(true)
  })

  it("does not match a bare character with a modifier held", () => {
    expect(matchesShortcut(press("?", { ctrlKey: true }), shortcut("showShortcuts"))).toBe(false)
  })
})

describe("the list the user reads", () => {
  it("gives every shortcut a group and keeps them in the order written", () => {
    const groups = shortcutGroups()

    expect(groups.map((group) => group.group)).toEqual(["Tabs", "Clips", "Help"])
    expect(groups.flatMap((group) => group.shortcuts)).toHaveLength(SHORTCUTS.length)
  })

  it("writes the keys as they are pressed", () => {
    expect(shortcutKeys(shortcut("previousTab"))).toEqual(["Ctrl", "Shift", "Tab"])
    expect(shortcutKeys(shortcut("showShortcuts"))).toEqual(["?"])
  })

  it("gives every shortcut a unique set of keys", () => {
    const keys = SHORTCUTS.map((entry) => entry.keys)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it("knows which shortcuts would be typed into a field", () => {
    expect(isBareKey(shortcut("showShortcuts"))).toBe(true)
    expect(isBareKey(shortcut("newTab"))).toBe(false)
  })
})
