/**
 * Every keyboard shortcut in the app, written once. The bindings and the list the user reads both
 * come from here, so a shortcut cannot work without being documented or be listed without working.
 */
export const SHORTCUTS = [
  { id: "newTab", keys: "ctrl+t", group: "Tabs", label: "New tab" },
  { id: "closeTab", keys: "ctrl+w", group: "Tabs", label: "Close this tab" },
  { id: "nextTab", keys: "ctrl+tab", group: "Tabs", label: "Next tab" },
  { id: "previousTab", keys: "ctrl+shift+tab", group: "Tabs", label: "Previous tab" },
  { id: "reopenTab", keys: "ctrl+shift+t", group: "Tabs", label: "Open the last tab closed again" },
  { id: "firstTab", keys: "ctrl+1", group: "Tabs", label: "First tab" },
  { id: "lastTab", keys: "ctrl+9", group: "Tabs", label: "Last tab" },
  { id: "clipList", keys: "ctrl+l", group: "Clips", label: "Show the clip list in this tab" },
  { id: "newClip", keys: "ctrl+n", group: "Clips", label: "Start a clip" },
  { id: "saveClip", keys: "ctrl+s", group: "Clips", label: "Save this clip" },
  { id: "branchClip", keys: "ctrl+d", group: "Clips", label: "Branch this clip into a new tab" },
  { id: "clipSettings", keys: "ctrl+,", group: "Clips", label: "What this clip is generated at" },
  { id: "addShot", keys: "ctrl+shift+n", group: "Clips", label: "Add a shot" },
  { id: "copyPrompt", keys: "ctrl+shift+c", group: "Clips", label: "Copy the prompt" },
  { id: "showShortcuts", keys: "?", group: "Help", label: "Show the keyboard shortcuts" },
] as const

/** What one shortcut does and the keys that do it. */
export type Shortcut = (typeof SHORTCUTS)[number]

/** The name of one shortcut, so a handler cannot be given for one that does not exist. */
export type ShortcutId = Shortcut["id"]

/** The shortcuts of each group, in the order they are written above. */
export function shortcutGroups(): { group: string; shortcuts: Shortcut[] }[] {
  const groups: { group: string; shortcuts: Shortcut[] }[] = []
  for (const shortcut of SHORTCUTS) {
    const found = groups.find((entry) => entry.group === shortcut.group)
    if (found) {
      found.shortcuts.push(shortcut)
      continue
    }
    groups.push({ group: shortcut.group, shortcuts: [shortcut] })
  }
  return groups
}

/** The keys of a shortcut as they are shown on screen, such as `Ctrl` and `Shift` and `T`. */
export function shortcutKeys(shortcut: Shortcut): string[] {
  return shortcut.keys.split("+").map((key) => {
    if (key === "ctrl") return "Ctrl"
    if (key === "shift") return "Shift"
    if (key === "alt") return "Alt"
    if (key === "tab") return "Tab"
    return key.toUpperCase()
  })
}

/**
 * Whether `event` is this shortcut. The Mac command key stands in for control, since the app names
 * one set of keys rather than a set for each platform.
 */
export function matchesShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  shortcut: Shortcut
): boolean {
  const parts = shortcut.keys.split("+")
  const key = parts[parts.length - 1]
  if (event.key.toLowerCase() !== key) return false

  const wants = (modifier: string): boolean => parts.includes(modifier)
  if (wants("ctrl") !== (event.ctrlKey || event.metaKey)) return false
  if (wants("alt") !== event.altKey) return false

  // A bare character such as ? already carries whatever shift the layout needed to type it.
  return isBareKey(shortcut) || wants("shift") === event.shiftKey
}

/** A shortcut with no modifier would be typed into a field, so it does not fire from one. */
export function isBareKey(shortcut: Shortcut): boolean {
  return !shortcut.keys.includes("+")
}
