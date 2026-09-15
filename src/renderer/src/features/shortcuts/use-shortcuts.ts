import { useEffect, useRef } from "react"
import { isBareKey, matchesShortcut, SHORTCUTS, type ShortcutId } from "./shortcuts"

/** What each shortcut does here. A shortcut with nothing against it is left to the browser. */
export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>

/** Whether the keystroke landed in something the user is typing into. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

/**
 * Binds the app's shortcuts to `handlers` for as long as the component is on screen. The keys come
 * from the one list the shortcuts dialog also reads, so the two cannot disagree.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  // Kept in a ref so that rebinding on every render does not remove and add the listener each time.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      for (const shortcut of SHORTCUTS) {
        if (!matchesShortcut(event, shortcut)) continue
        if (isBareKey(shortcut) && isTyping(event.target)) return
        const handler = latest.current[shortcut.id]
        if (!handler) return
        event.preventDefault()
        handler()
        return
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
