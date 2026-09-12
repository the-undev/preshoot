import { createContext, useContext } from "react"

/** Set by the provider that holds the one settings dialog. */
export const OpenSettings = createContext<(() => void) | null>(null)

/** Opens the app settings from anywhere in the workspace, such as a message about a missing model. */
export function useOpenSettings(): () => void {
  const open = useContext(OpenSettings)
  if (!open) {
    throw new Error("useOpenSettings needs a SettingsDialogProvider above it")
  }
  return open
}
