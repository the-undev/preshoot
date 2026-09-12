import { useState } from "react"
import { OpenSettings } from "./settings-dialog-context"
import { SettingsDialog } from "./settings-dialog"

interface SettingsDialogProviderProps {
  children: React.ReactNode
}

/** Holds the one settings dialog, so anything under it can ask for it. */
export function SettingsDialogProvider({
  children,
}: SettingsDialogProviderProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <OpenSettings.Provider value={() => setOpen(true)}>
      {children}
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </OpenSettings.Provider>
  )
}
