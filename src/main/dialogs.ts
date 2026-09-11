import { BrowserWindow, dialog } from "electron"
import type { Dialogs } from "./trpc/context"

/** Native folder pickers, shown over `window`. */
export function createDialogs(window: BrowserWindow): Dialogs {
  return {
    async pickDirectory({ title, allowCreate }) {
      const result = await dialog.showOpenDialog(window, {
        title,
        properties: allowCreate ? ["openDirectory", "createDirectory"] : ["openDirectory"],
      })
      return result.filePaths[0] ?? null
    },
  }
}
